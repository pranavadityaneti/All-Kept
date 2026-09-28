// Gemini client for classification: Gemini 2.5 Flash by default, structured JSON output through the
// generateContent API, safety-block fallback. Plain fetch, no SDK — an npm import here would make
// `deno check` rewrite node_modules and move the build fingerprint (see ERRORS.md), the same reason
// openai.ts uses fetch and only anthropic.ts carries the SDK.
import type { ClassifyDeps, ModelResult, ModelUsage } from "./classify.ts";

export const DEFAULT_MODEL = "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 2048;

// The shape the model answers in lives beside the prompt and the validator, so the three cannot drift.
import { OUTPUT_SCHEMA } from "./classify.ts";
export { OUTPUT_SCHEMA };

interface GenerateReply {
  candidates?: {
    content?: { parts?: { text?: string }[]; role?: string };
    // STOP | MAX_TOKENS | SAFETY | RECITATION | OTHER
    finishReason?: string;
  }[];
  // A prompt refused before any candidate: the block reason sits here, not on a candidate.
  promptFeedback?: { blockReason?: string } | null;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string } | null;
}

/**
 * Gemini counts cached tokens inside promptTokenCount, as OpenAI counts them inside input_tokens, so
 * the same split keeps one price table serving every vendor. Thinking tokens are billed as output
 * but reported apart in thoughtsTokenCount; they are folded back into output_tokens so the cost line
 * is whole, and kept in reasoning_tokens for visibility. With thinkingConfig.thinkingBudget 0 they
 * are normally zero.
 */
export function normaliseUsage(u: GenerateReply["usageMetadata"]): ModelUsage | null {
  if (!u) return null;
  const cached = u.cachedContentTokenCount ?? 0;
  const thoughts = u.thoughtsTokenCount ?? 0;
  const usage: ModelUsage = {
    input_tokens: Math.max(0, (u.promptTokenCount ?? 0) - cached),
    output_tokens: (u.candidatesTokenCount ?? 0) + thoughts,
    cache_read_input_tokens: cached,
  };
  if (thoughts) usage.reasoning_tokens = thoughts;
  return usage;
}

export function geminiDeps(apiKey: string, model: string = DEFAULT_MODEL, fetchImpl: typeof fetch = fetch): ClassifyDeps {
  return {
    async call(system, user, shape, picture): Promise<ModelResult> {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${BASE}/${model}:generateContent`, {
          method: "POST",
          signal: ctrl.signal,
          // The key in a header, never the URL: a query-string key lands in logs and proxies.
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            // The picture first, then the words, as the other adapters send them. Gemini takes the
            // bytes inline; the same base64 openai.ts and anthropic.ts send, no link ever minted.
            contents: [{
              role: "user",
              parts: picture
                ? [{ inline_data: { mime_type: picture.mediaType, data: picture.base64 } }, { text: user }]
                : [{ text: user }],
            }],
            generationConfig: {
              responseMimeType: "application/json",
              // responseJsonSchema, not responseSchema: the classification schema uses anyOf and
              // ["string","null"] for venue, event_at and screen_text, which the older OpenAPI-subset
              // responseSchema field rejects. responseJsonSchema takes standard JSON Schema.
              responseJsonSchema: shape?.schema ?? OUTPUT_SCHEMA,
              temperature: 0,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              // The low-effort analog: Flash reasons unless told the budget is nothing.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as GenerateReply;
        if (!res.ok) return { output: null, refused: false, model, usage: null, error: `gemini ${res.status}: ${(body.error?.message ?? "").slice(0, 200)}` };
        const used = body.modelVersion ?? model;
        const usage = normaliseUsage(body.usageMetadata);
        // A prompt blocked outright, or a candidate stopped for safety, is a refusal — not a malformed
        // reply to retry. RECITATION is treated the same: the content cannot be returned.
        const finish = body.candidates?.[0]?.finishReason;
        if (body.promptFeedback?.blockReason || finish === "SAFETY" || finish === "RECITATION") return { output: null, refused: true, model: used, usage };
        if (finish === "MAX_TOKENS") return { output: null, refused: false, model: used, usage, error: "incomplete: max_output_tokens" };
        const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        try {
          return { output: JSON.parse(text), refused: false, model: used, usage };
        } catch {
          return { output: null, refused: false, model: used, usage, error: "model returned non-JSON" };
        }
      } catch (e) {
        return { output: null, refused: false, model, usage: null, error: String(e).slice(0, 300) };
      } finally {
        clearTimeout(t);
      }
    },
  };
}
