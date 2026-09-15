import { assertEquals } from "jsr:@std/assert@1";
import { runClassification, retryableClassificationError, type ClassificationClaim, type ClassificationWorkerDeps } from "../_shared/classification-worker.ts";

const claim: ClassificationClaim = { lease: "test", revision: 1, attempt: 1, platform: "web", kind: "article", url: null, title: "Cooking", text: null, author: null, note: null, language: "en" };
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

Deno.test("the save's picture is read when the claim names one, handed to the model, and recorded in usage", async () => {
  const got: unknown[] = [];
  const { deps, finished } = fixture({
    claim: async () => ({ ...claim, thumbnail_path: "u1/i1.jpg" }),
    classifier: { call: async (_s, _u, _shape, picture) => { got.push(picture); return { output: { category: "Travel & places" }, refused: false, model: "test", usage: { input_tokens: 700, output_tokens: 100 } }; } },
    picture: async (path) => ({ mediaType: "image/jpeg", base64: btoa(`bytes of ${path}`) }),
  });
  const results: { usage: unknown }[] = [];
  deps.finish = async (_, r, retryable) => { finished.push({ error: r.error, retryable }); results.push({ usage: r.usage }); return true; };
  await runClassification(deps);
  assertEquals(got, [{ mediaType: "image/jpeg", base64: btoa("bytes of u1/i1.jpg") }]);
  assertEquals(results[0]!.usage, { input_tokens: 700, output_tokens: 100, picture: { bytes: "bytes of u1/i1.jpg".length, type: "image/jpeg" } });
});

Deno.test("no picture on the claim, or one that cannot be read, still sorts from the words; a failed read is recorded as tried, no path leaves no record", async () => {
  const got: unknown[] = [];
  const classifier = { call: async (_s: string, _u: string, _shape?: unknown, picture?: unknown) => { got.push(picture); return { output: { category: "Food & recipes" }, refused: false, model: "test", usage: { input_tokens: 600, output_tokens: 90 } }; } };
  const results: { usage: unknown }[] = [];
  const record = (f: ReturnType<typeof fixture>) => { f.deps.finish = async (_, r) => { results.push({ usage: r.usage }); return true; }; return f.deps; };
  await runClassification(record(fixture({ classifier, picture: async () => { throw new Error("must not be asked without a path"); } })));
  await runClassification(record(fixture({ claim: async () => ({ ...claim, thumbnail_path: "u1/gone.jpg" }), classifier, picture: async () => null })));
  await runClassification(record(fixture({ claim: async () => ({ ...claim, thumbnail_path: "u1/broken.jpg" }), classifier, picture: async () => { throw new Error("storage down"); } })));
  assertEquals(got, [undefined, undefined, undefined]);
  // No key without a path; an explicit null when a path was there and the read failed — so the
  // re-sort pass, which looks for a picture never tried, tries a broken one once and not forever.
  assertEquals(results.map((r) => r.usage), [
    { input_tokens: 600, output_tokens: 90 },
    { input_tokens: 600, output_tokens: 90, picture: null },
    { input_tokens: 600, output_tokens: 90, picture: null },
  ]);
});
