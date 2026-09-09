import { saveLink } from "../_shared/normalize.ts";
import { LIMITS, type CaptureInput, type CaptureResult } from "../_shared/contracts.ts";
import { apiError, json, readJson } from "../_shared/http.ts";

export interface SaveLinkDeps {
  userId(req: Request): Promise<string | null>;
  capture(input: CaptureInput): Promise<CaptureResult>;
  enqueue(itemId: string): void;
}

export async function handleSaveLink(req: Request, deps: SaveLinkDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in before saving a link.");
  const body = await readJson(req);
  const text = typeof body?.["text"] === "string" ? body["text"].trim() : "";
  const requestId = body?.["requestId"];
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    return apiError("bad_request", "A valid requestId is required.");
  }
  const link = text.length <= LIMITS.textMaxChars ? saveLink(text) : null;
  if (!text || !link) {
    return apiError("bad_request", "That doesn't look like a link. Copy the address and paste it here.");
  }
  const result = await deps.capture({
    userId, sourceId: null, sourceKind: "share", sourceEventId: requestId,
    savedAt: new Date().toISOString(), sharedUrl: link.canonicalUrl ?? link.sourceUrl!, sharedText: text,
  });
  deps.enqueue(result.itemId);
  return json(result);
}
