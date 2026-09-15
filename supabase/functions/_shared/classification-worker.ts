import { classify, type ClassifyDeps, type ClassifyInput, type ClassifyResult, type Picture } from "./classify.ts";

export interface ClassificationClaim extends ClassifyInput {
  lease: string; revision: number; attempt: number;
  /** Where the save's picture is stored, when it has one. */
  thumbnail_path?: string | null;
}
export interface ClassificationWorkerDeps {
  claim(retry: boolean): Promise<ClassificationClaim | null>;
  finish(claim: ClassificationClaim, result: ClassifyResult, retryable: boolean): Promise<boolean>;
  category(): Promise<string | null>;
  classifier: ClassifyDeps | null;
  /** The stored picture at a path, or null when it cannot be read. Never asked without a path. */
  picture?(path: string): Promise<Picture | null>;
}

/**
 * The save's picture, for the model, and whether one was there to try. Best effort: a picture that
 * cannot be read is no reason not to sort the save from its words, so nothing here throws.
 */
async function pictureFor(claim: ClassificationClaim, deps: ClassificationWorkerDeps): Promise<{ tried: boolean; picture?: Picture }> {
  if (!claim.thumbnail_path || !deps.picture) return { tried: false };
  try {
    return { tried: true, picture: (await deps.picture(claim.thumbnail_path)) ?? undefined };
  } catch {
    return { tried: true };
  }
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
    const { tried, picture } = deps.classifier ? await pictureFor(claim, deps) : { tried: false };
    result = deps.classifier ? await classify(claim, deps.classifier, picture)
      : { output: null, error: "classifier unavailable", model: "unconfigured", usage: null };
    // What became of the picture is kept with what the call cost, so a picture that lands later is
    // known to be new, and one that could not be read is known to have been tried.
    if (tried && result.usage) result.usage = { ...result.usage, picture: picture ? { bytes: Math.floor(picture.base64.length * 3 / 4), type: picture.mediaType } : null };
  } catch {
    result = { output: null, error: "classification request failed", model: "unknown", usage: null };
  }
  await deps.finish(claim, result, retryableClassificationError(result.error));
  // Read the final row so a concurrent user correction always wins over the model's category.
  return deps.category();
}
