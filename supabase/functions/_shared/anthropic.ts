// Claude client for classification: claude-opus-5, structured JSON output, cached system prompt, low effort, refusal fallback.
import Anthropic from "npm:@anthropic-ai/sdk";
import type { ClassifyDeps, ModelResult } from "./classify.ts";

export const MODEL = "claude-opus-5";

// The shape the model answers in lives beside the prompt and the validator, so the three cannot drift.
import { OUTPUT_SCHEMA } from "./classify.ts";

export function anthropicDeps(apiKey: string): ClassifyDeps {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 });
  return {
    async call(system, user, shape, picture): Promise<ModelResult> {
      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 1024,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: { type: "json_schema", schema: shape?.schema ?? OUTPUT_SCHEMA } },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          // The picture first, then the words, as the format prefers.
          messages: [{ role: "user", content: picture
            ? [{ type: "image", source: { type: "base64", media_type: picture.mediaType, data: picture.base64 } }, { type: "text", text: user }]
            : user }],
        } as never) as unknown as { content: { type: string; text?: string }[]; stop_reason: string; model: string; usage: ModelResult["usage"] };
        if (response.stop_reason === "refusal") return { output: null, refused: true, model: response.model, usage: response.usage };
        const text = response.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        let output: unknown = null;
        try { output = JSON.parse(text); } catch { return { output: null, refused: false, model: response.model, usage: response.usage, error: "model returned non-JSON" }; }
        return { output, refused: false, model: response.model, usage: response.usage };
      } catch (e) {
        return { output: null, refused: false, model: MODEL, usage: null, error: e instanceof Anthropic.APIError ? `anthropic ${e.status ?? "request failed"}` : "anthropic request failed" };
      }
    },
  };
}
