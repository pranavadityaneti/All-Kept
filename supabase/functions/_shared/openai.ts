// OpenAI client for classification: GPT-5.6 Sol by default, strict JSON schema output through the Responses API, refusal fallback. Plain fetch, no SDK.
import type { ClassifyDeps, ModelResult, ModelUsage } from "./classify.ts";
import { ACTIONABILITY, CATEGORIES, ENTITY_TYPES } from "./contracts.ts";

export const DEFAULT_MODEL = "gpt-5.6-sol";
export const REASONING_EFFORT = "low";
const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 2048; // reasoning tokens count against this too

/** Strict mode: every property required, no extras, no numeric bounds (validateOutput applies the bounds). */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    tags: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    entities: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: [...ENTITY_TYPES] }, name: { type: "string" } }, required: ["type", "name"], additionalProperties: false } },
    language: { type: "string" },
    actionability: { type: "string", enum: [...ACTIONABILITY] },
    confidence: { type: "number" },
  },
  required: ["category", "tags", "summary", "entities", "language", "actionability", "confidence"],
  additionalProperties: false,
} as const;

interface ResponsesReply {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  model?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string; type?: string } | null;
}

/** OpenAI counts cached tokens inside input_tokens; our usage keeps them apart so one price table serves both vendors. */
export function normaliseUsage(u: ResponsesReply["usage"]): ModelUsage | null {
  if (!u) return null;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const usage: ModelUsage = { input_tokens: Math.max(0, (u.input_tokens ?? 0) - cached), output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: cached };
  const reasoning = u.output_tokens_details?.reasoning_tokens;
  if (reasoning) usage.reasoning_tokens = reasoning;
  return usage;
}

export function openaiDeps(apiKey: string, model: string = DEFAULT_MODEL, fetchImpl: typeof fetch = fetch): ClassifyDeps {
  return {
    async call(system, user): Promise<ModelResult> {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(ENDPOINT, {
          method: "POST",
          signal: ctrl.signal,
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            instructions: system,
            input: user,
            reasoning: { effort: REASONING_EFFORT },
            text: { format: { type: "json_schema", name: "item_ai", schema: OUTPUT_SCHEMA, strict: true } },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            store: false,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as ResponsesReply;
        if (!res.ok) return { output: null, refused: false, model, usage: null, error: `openai ${res.status}: ${(body.error?.message ?? "").slice(0, 200)}` };
        const used = body.model ?? model;
        const usage = normaliseUsage(body.usage);
        const message = (body.output ?? []).find((o) => o.type === "message");
        if (message?.content?.some((c) => c.type === "refusal")) return { output: null, refused: true, model: used, usage };
        if (body.status === "incomplete") return { output: null, refused: false, model: used, usage, error: `incomplete: ${body.incomplete_details?.reason ?? "unknown"}` };
        const text = (message?.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
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
