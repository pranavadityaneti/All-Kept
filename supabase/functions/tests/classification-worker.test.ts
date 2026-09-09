import { assertEquals } from "jsr:@std/assert@1";
import { runClassification, retryableClassificationError, type ClassificationClaim, type ClassificationWorkerDeps } from "../_shared/classification-worker.ts";

const claim: ClassificationClaim = { lease: "test", revision: 1, attempt: 1, platform: "web", kind: "article", url: null, title: "Cooking", text: null, author: null, note: null };
function fixture(overrides: Partial<ClassificationWorkerDeps> = {}) {
  const finished: { error: string | null; retryable: boolean }[] = [];
  const deps: ClassificationWorkerDeps = {
    claim: async () => claim,
    classifier: { call: async () => ({ output: { category: "Food & recipes" }, refused: false, model: "test", usage: null }) },
    finish: async (_, r, retryable) => { finished.push({ error: r.error, retryable }); return true; },
    category: async () => "My correction",
    ...overrides,
  };
  return { deps, finished };
}
Deno.test("an already claimed item never calls the classifier", async () => {
  const { deps, finished } = fixture({ claim: async () => null, classifier: { call: () => { throw new Error("must not run"); } } });
  assertEquals(await runClassification(deps), "My correction");
  assertEquals(finished, []);
});
Deno.test("success returns the stored user correction rather than overwriting it", async () => {
  const { deps, finished } = fixture();
  assertEquals(await runClassification(deps), "My correction");
  assertEquals(finished[0]?.error, null);
});
Deno.test("transport failures and malformed replies are persisted for retry", async () => {
  const { deps, finished } = fixture({ classifier: { call: () => { throw new Error("timeout"); } } });
  await runClassification(deps);
  assertEquals(finished, [{ error: "classification request failed", retryable: true }]);
  assertEquals(retryableClassificationError("invalid model output"), true);
  assertEquals(retryableClassificationError("openai 429"), true);
  assertEquals(retryableClassificationError("anthropic 503"), true);
});
Deno.test("missing configuration, refusals and invalid keys stop with actionable failure", async () => {
  const { deps, finished } = fixture({ classifier: null });
  await runClassification(deps);
  assertEquals(finished, [{ error: "classifier unavailable", retryable: false }]);
  for (const error of ["refused", "openai 401", "anthropic 403", "openai 400"]) assertEquals(retryableClassificationError(error), false);
});
Deno.test("manual retry is passed to the atomic database claim", async () => {
  let retry = false;
  const { deps } = fixture({ claim: async (r) => { retry = r; return null; } });
  await runClassification(deps, true);
  assertEquals(retry, true);
});
