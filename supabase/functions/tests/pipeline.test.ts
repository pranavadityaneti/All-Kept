import { assertEquals } from "jsr:@std/assert@1";
import { nextAttemptAfter, previewRetryDue } from "../_shared/pipeline.ts";
import { RETRY_LADDER_MS } from "../_shared/enrich.ts";

const NOW = new Date("2026-09-14T10:00:00Z");
const earlier = "2026-09-14T09:59:00Z";
const later = "2026-09-14T10:01:00Z";
const row = (over: Partial<Parameters<typeof previewRetryDue>[0]> = {}) => ({
  status: "ready", thumbnail_path: null, thumbnail_url_remote: null, next_attempt_at: earlier, ...over,
});

Deno.test("a settled card with no picture and a due preview retry is asked for again", () => {
  assertEquals(previewRetryDue(row(), NOW), true);
  assertEquals(previewRetryDue(row({ status: "preview_unavailable" }), NOW), true);
  assertEquals(previewRetryDue(row({ next_attempt_at: NOW.toISOString() }), NOW), true); // due means now, too
});

Deno.test("nothing is asked again before its time, without a schedule, or once any picture is held", () => {
  assertEquals(previewRetryDue(row({ next_attempt_at: later }), NOW), false);
  assertEquals(previewRetryDue(row({ next_attempt_at: null }), NOW), false);
  assertEquals(previewRetryDue(row({ thumbnail_url_remote: "https://scontent.cdninstagram.com/a.jpg" }), NOW), false); // the sweeper's snapshot pass owns that
  assertEquals(previewRetryDue(row({ thumbnail_path: "u1/i1.jpg" }), NOW), false);
});

Deno.test("only a settled card qualifies; pending, failed and no-link saves have their own paths", () => {
  for (const status of ["pending", "failed", "no_link"]) assertEquals(previewRetryDue(row({ status }), NOW), false, status);
});

Deno.test("the next attempt is scheduled from a failure's ladder or a settled card's preview retry, and cleared otherwise", () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  assertEquals(nextAttemptAfter({ status: "failed", patch: {}, retryAfterMs: RETRY_LADDER_MS[1] }, NOW), at(RETRY_LADDER_MS[1]!));
  assertEquals(nextAttemptAfter({ status: "failed", patch: {}, retryAfterMs: 0 }, NOW), null); // ladder spent: left for the person
  assertEquals(nextAttemptAfter({ status: "ready", patch: {}, retryPreviewAfterMs: RETRY_LADDER_MS[0] }, NOW), at(RETRY_LADDER_MS[0]!));
  assertEquals(nextAttemptAfter({ status: "preview_unavailable", patch: {}, retryPreviewAfterMs: RETRY_LADDER_MS[2] }, NOW), at(RETRY_LADDER_MS[2]!));
  assertEquals(nextAttemptAfter({ status: "ready", patch: {} }, NOW), null);
  assertEquals(nextAttemptAfter({ status: "preview_unavailable", patch: {} }, NOW), null);
});
