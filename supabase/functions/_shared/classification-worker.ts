import { classify, type ClassifyDeps, type ClassifyInput, type ClassifyResult } from "./classify.ts";

export interface ClassificationClaim extends ClassifyInput { lease: string; revision: number; attempt: number }
export interface ClassificationWorkerDeps {
  claim(retry: boolean): Promise<ClassificationClaim | null>;
  finish(claim: ClassificationClaim, result: ClassifyResult, retryable: boolean): Promise<boolean>;
  category(): Promise<string | null>;
  classifier: ClassifyDeps | null;
}

/** Configuration/auth/refusal failures need intervention; transport and malformed replies get bounded retries. */
export function retryableClassificationError(error: string | null): boolean {
  return !/^(refused|classifier unavailable)$|\b(?:openai|anthropic)\s+(400|401|403|404|422)\b/i.test(error ?? "");
}

export async function runClassification(deps: ClassificationWorkerDeps, retry = false): Promise<string | null> {
  const claim = await deps.claim(retry);
  if (!claim) return deps.category();
  let result: ClassifyResult;
  try {
    result = deps.classifier ? await classify(claim, deps.classifier)
      : { output: null, error: "classifier unavailable", model: "unconfigured", usage: null };
  } catch {
    result = { output: null, error: "classification request failed", model: "unknown", usage: null };
  }
  await deps.finish(claim, result, retryableClassificationError(result.error));
  // Read the final row so a concurrent user correction always wins over the model's category.
  return deps.category();
}
