import { apiError, json, readJson } from "../_shared/http.ts";
import { validEmbedding, type Embed } from "../_shared/embeddings.ts";

type Row = Record<string, unknown>;
export interface SearchDeps {
  authenticate(req: Request): Promise<boolean>;
  query(req: Request, args: Record<string, unknown>): Promise<Row[]>;
  embed: Embed | null;
}
const uuid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const filters = (v: unknown): v is string[] | undefined => v === undefined || (Array.isArray(v) && v.length <= 30 && v.every((s) => typeof s === "string" && s.length <= 80));

export async function handleSearch(req: Request, deps: SearchDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  if (!await deps.authenticate(req)) return apiError("unauthorized", "invalid or missing token");
  const body = await readJson(req);
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  // Every group is validated, not just the two that existed first: an unchecked array here is an
  // unchecked array on its way to the database.
  if (!q || q.length > 300 || !filters(body?.platforms) || !filters(body?.categories)
      || !filters(body?.shapes) || !filters(body?.flags)) return apiError("bad_request", "invalid search");
  const cursor = body?.cursor as Row | undefined;
  if (cursor != null && (typeof cursor !== "object" || !uuid(cursor.id) || typeof cursor.score !== "number" || !Number.isFinite(cursor.score)
    || typeof cursor.savedAt !== "string" || !Number.isFinite(Date.parse(cursor.savedAt)) || (cursor.embedding !== null && !validEmbedding(cursor.embedding)))) {
    return apiError("bad_request", "invalid cursor");
  }
  // Reuse the first page's vector/mode. A later provider outage must not change paging order.
  let vector: number[] | null = cursor ? cursor.embedding as number[] | null : null;
  if (!cursor && deps.embed) {
    try { vector = (await deps.embed([q]))[0] ?? null; } catch { /* Keyword search stays available during provider outages. */ }
  }
  const rows = await deps.query(req, {
    q, query_embedding: vector ? JSON.stringify(vector) : null,
    platforms: body!.platforms?.length ? body!.platforms : null,
    categories: body!.categories?.length ? body!.categories : null,
    shapes: body!.shapes?.length ? body!.shapes : null,
    flags: body!.flags?.length ? body!.flags : null,
    before: cursor ? { score: cursor.score, savedAt: cursor.savedAt, id: cursor.id } : null,
    lim: 31,
  });
  const items = rows.slice(0, 30);
  const last = items[items.length - 1];
  return json({ items, mode: vector ? "hybrid" : "keyword", nextCursor: rows.length > 30 && last
    ? { score: last.score, savedAt: last.last_saved_at, id: last.id, embedding: vector } : null });
}
