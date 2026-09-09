// POST: turns an Instagram data export into saves.
//
// The app uploads the file the person got from Meta into private storage and calls this with its
// path. Everything here is theirs: the path must sit under their own folder, and every row is
// written with their id. The saves are created empty and the sweeper fills them in over the next
// hours, so a decade of saves does not have to arrive at once.
import { BlobReader, TextWriter, ZipReader } from "jsr:@zip-js/zip-js@2.7.62";
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { parseSavedExport, type SavedEntry } from "../_shared/normalize.ts";
import type { ImportSavesResponse } from "../_shared/contracts.ts";

/** Guards against a file that would take the whole function down. */
const MAX_BYTES = 60 * 1024 * 1024;
/** One JSON file inside the zip, uncompressed. A zip can claim to hold far more than it is. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** Everything we unpack from one zip, together. */
const MAX_UNPACKED_TOTAL = 96 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const BATCH = 200;

/** Reads the export, whether the person picked the whole zip or just the one file inside it. */
async function readExport(bytes: Uint8Array, name: string): Promise<unknown[]> {
  const asJson = (text: string): unknown => { try { return JSON.parse(text); } catch { return null; } };

  if (!name.toLowerCase().endsWith(".zip")) {
    const parsed = asJson(new TextDecoder().decode(bytes));
    return parsed === null ? [] : [parsed];
  }

  const zip = new ZipReader(new BlobReader(new Blob([bytes as BlobPart])));
  const documents: unknown[] = [];
  let unpacked = 0;
  try {
    for (const entry of await zip.getEntries()) {
      // Meta buries it under your_instagram_activity/saved/saved_posts.json, and moves it about.
      if (entry.directory || !/\.json$/i.test(entry.filename)) continue;
      if (!/saved/i.test(entry.filename)) continue;
      // A small zip can unpack to gigabytes. Believe the header enough to refuse, not enough to read.
      const size = entry.uncompressedSize ?? 0;
      if (size > MAX_UNPACKED_BYTES || unpacked + size > MAX_UNPACKED_TOTAL) continue;
      unpacked += size;
      const text = await entry.getData?.(new TextWriter());
      const parsed = text ? asJson(text) : null;
      if (parsed !== null) documents.push(parsed);
    }
  } finally {
    await zip.close();
  }
  return documents;
}

/** One list of saves across every file we read, because the same post can appear in more than one. */
function mergeDocuments(documents: unknown[]): SavedEntry[] {
  const byCode = new Map<string, SavedEntry>();
  for (const doc of documents) {
    for (const entry of parseSavedExport(doc)) {
      const existing = byCode.get(entry.code);
      if (!existing) byCode.set(entry.code, entry);
      else {
        if (!existing.savedAt && entry.savedAt) existing.savedAt = entry.savedAt;
        if (!existing.author && entry.author) existing.author = entry.author;
      }
    }
  }
  return [...byCode.values()]
    .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""))
    .slice(0, MAX_ENTRIES);
}

/**
 * Files left behind by a run that died between the upload and the read. The person owns the folder,
 * nothing else is in it, and the next import clears the last one's leftovers.
 */
async function removeStale(db: ReturnType<typeof adminClient>, userId: string, keep: string): Promise<void> {
  const { data } = await db.storage.from("imports").list(userId, { limit: 100 });
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale = (data ?? [])
    .filter((o) => `${userId}/${o.name}` !== keep && new Date(o.created_at ?? Date.now()).getTime() < cutoff)
    .map((o) => `${userId}/${o.name}`);
  if (stale.length > 0) await db.storage.from("imports").remove(stale);
}

Deno.serve(async (req) => {
  const db = adminClient();
  let importId: string | null = null;
  let uploaded: string | null = null;
  try {
    if (req.method !== "POST") return apiError("bad_request", "POST only");
    const userId = await userIdFromRequest(req);
    if (!userId) return apiError("unauthorized", "invalid or missing token");

    const body = await readJson(req);
    const path = typeof body?.["path"] === "string" ? body["path"] : "";
    if (!path.startsWith(`${userId}/`)) return apiError("bad_request", "that file is not yours");
    uploaded = path;

    const file = await db.storage.from("imports").download(path);
    if (file.error || !file.data) return apiError("not_found", "could not read that file");
    // Refuse before it is in memory, not after.
    if (file.data.size > MAX_BYTES) return apiError("bad_request", "that file is too large to read");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    // Never let tidying up stop an import.
    await removeStale(db, userId, path).catch((err: unknown) => console.error("import-saves could not clear old files", err));

    const entries = mergeDocuments(await readExport(bytes, path));
    if (entries.length === 0) {
      await db.storage.from("imports").remove([path]);
      return apiError("bad_request", "we could not find any saved posts in that file");
    }

    const { data: record, error: e1 } = await db.from("imports").insert({ user_id: userId, found: entries.length }).select("id").single();
    if (e1) throw e1;
    importId = record.id as string;

    // What the person already has. The identity index is partial, so it cannot serve an upsert;
    // asking first is also kinder, because it leaves their existing categories and notes untouched.
    const codes = entries.map((e) => e.code);
    const seen = new Set<string>();
    for (let i = 0; i < codes.length; i += BATCH) {
      const { data, error } = await db.from("items").select("external_id")
        .eq("user_id", userId).eq("platform", "instagram").in("external_id", codes.slice(i, i + BATCH));
      if (error) throw error;
      for (const row of data ?? []) if (row.external_id) seen.add(String(row.external_id));
    }
    const fresh = entries.filter((e) => !seen.has(e.code));

    let added = 0;
    for (let i = 0; i < fresh.length; i += BATCH) {
      const rows = fresh.slice(i, i + BATCH).map((entry) => ({
        user_id: userId,
        platform: "instagram",
        kind: entry.kind === "p" ? "post" : "short_video",
        source_url: entry.url,
        canonical_url: entry.url,
        external_id: entry.code,
        author_name: entry.author,
        captured_via: "import",
        import_id: importId,
        status: "pending",
        saved_at: entry.savedAt ?? new Date().toISOString(),
        last_saved_at: entry.savedAt ?? new Date().toISOString(),
      }));
      const { data, error } = await db.from("items").insert(rows).select("id");
      if (!error) { added += (data ?? []).length; continue; }
      if (error.code !== "23505") throw error;
      // A race with a save arriving by message: put the rest in one at a time and skip the clash.
      for (const row of rows) {
        const one = await db.from("items").insert(row).select("id");
        if (!one.error) added += 1;
        else if (one.error.code !== "23505") throw one.error;
      }
    }

    await db.from("imports").update({ added, skipped: entries.length - added, finished_at: new Date().toISOString() }).eq("id", importId);
    await db.storage.from("imports").remove([path]); // the file has been read; no reason to keep it

    const result: ImportSavesResponse = { importId, found: entries.length, added, skipped: entries.length - added };
    return json(result);
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    console.error("import-saves failed", e);
    // Without this the run stays open for ever and the app waits on a bar that never fills.
    if (importId) {
      await db.from("imports").update({ error: reason, finished_at: new Date().toISOString() }).eq("id", importId)
        .then(undefined, (err: unknown) => console.error("import-saves could not record the failure", err));
    }
    // Their file has done all it is going to do here.
    if (uploaded) await db.storage.from("imports").remove([uploaded]).catch((err: unknown) => console.error("import-saves could not remove the file", err));
    return apiError("internal", `could not read that export: ${reason}`);
  }
});
