import { saveLink } from "../_shared/normalize.ts";
import { LIMITS, type CaptureInput, type CaptureResult } from "../_shared/contracts.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { PaymentRequiredError } from "../_shared/capture.ts";
import { ShareTokenRateLimited } from "../_shared/share-token.ts";

export interface SaveLinkDeps {
  userId(req: Request): Promise<string | null>;
  capture(input: CaptureInput): Promise<CaptureResult>;
  enqueue(itemId: string): void;
}

export async function handleSaveLink(req: Request, deps: SaveLinkDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  let userId: string | null;
  try { userId = await deps.userId(req); }
  catch (e) {
    if (e instanceof ShareTokenRateLimited) return apiError("rate_limited", "That is a lot of saves at once. Try again in a little while.");
    throw e;
  }
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
  // The DM door has always said "I can keep posts, reels and links for now, not photos or stories".
  // A pasted story used to slip past that and become a save whose link is dead within the day, so
  // the two doors now answer the same way.
  if (link.kind === "story") {
    return apiError("bad_request", "Stories disappear after 24 hours, so there is nothing to keep. Save the post or the profile instead.");
  }

  let result: CaptureResult;
  try {
    result = await deps.capture({
      userId, sourceId: null, sourceKind: "share", sourceEventId: requestId,
      savedAt: new Date().toISOString(), sharedUrl: link.canonicalUrl ?? link.sourceUrl!, sharedText: text,
    });
  } catch (e) {
    // The free saves are used and there is no subscription. 402 rather than 400: the app opens the
    // paywall on it, and the share extension keeps the link queued instead of dropping it.
    if (e instanceof PaymentRequiredError) return apiError("payment_required", "You've used your 25 free saves. Subscribe in Allkept to keep saving.");
    throw e;
  }
  deps.enqueue(result.itemId);
  return json(result);
}
