// Claude client for classification: claude-opus-5, structured JSON output, cached system prompt, low effort, refusal fallback.
import Anthropic from "npm:@anthropic-ai/sdk";
import type { ClassifyDeps, ModelResult } from "./classify.ts";
import { ACTIONABILITY, CATEGORIES, ENTITY_TYPES } from "./contracts.ts";

export const MODEL = "claude-opus-5";

const OUTPUT_SCHEMA = {
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

export function anthropicDeps(apiKey: string): ClassifyDeps {
  const client = new Anthropic({ apiKey });
  return {
    async call(system, user): Promise<ModelResult> {
      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 1024,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
        } as never) as unknown as { content: { type: string; text?: string }[]; stop_reason: string; model: string; usage: ModelResult["usage"] };
        if (response.stop_reason === "refusal") return { output: null, refused: true, model: response.model, usage: response.usage };
        const text = response.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        let output: unknown = null;
        try { output = JSON.parse(text); } catch { return { output: null, refused: false, model: response.model, usage: response.usage, error: "model returned non-JSON" }; }
        return { output, refused: false, model: response.model, usage: response.usage };
      } catch (e) {
        return { output: null, refused: false, model: MODEL, usage: null, error: String(e).slice(0, 300) };
      }
    },
  };
}
