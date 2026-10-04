// The models the Weave speaks to: one to understand, one to plan, each asked in a strict schema.
//
// The sorter's adapter is tuned for a short answer in twenty seconds; a plan is thousands of
// tokens and a minute or two of thought, so this one takes its model, its effort, its room and
// its patience as arguments. Everything else — the cached system prompt, the JSON-schema format,
// the refusal and the non-JSON answer named as such — is the same discipline.
import Anthropic from "npm:@anthropic-ai/sdk";
import type { ModelResult } from "../classify.ts";
import { normaliseUsage } from "../openai.ts";

/** One ask of a model. The patience is the options' unless the caller has less time left — a worker near its end. */
export type WeaveCall = (system: string, user: string, schema: Record<string, unknown>, timeoutMs?: number) => Promise<ModelResult>;

export interface WeaveModelOptions {
  maxTokens: number;
  effort: "low" | "medium" | "high";
  timeoutMs: number;
}

export function weaveModel(apiKey: string, model: string, options: WeaveModelOptions): WeaveCall {
  const client = new Anthropic({ apiKey, timeout: options.timeoutMs, maxRetries: 0 });
  return async (system, user, schema, timeoutMs) => {
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: options.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: options.effort, format: { type: "json_schema", schema } },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      } as never, { timeout: timeoutMs ?? options.timeoutMs }) as unknown as { content: { type: string; text?: string }[]; stop_reason: string; model: string; usage: ModelResult["usage"] };
      if (response.stop_reason === "refusal") return { output: null, refused: true, model: response.model, usage: response.usage };
      if (response.stop_reason === "max_tokens") return { output: null, refused: false, model: response.model, usage: response.usage, error: "the answer ran past its room" };
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      try { return { output: JSON.parse(text), refused: false, model: response.model, usage: response.usage }; }
      catch { return { output: null, refused: false, model: response.model, usage: response.usage, error: "model returned non-JSON" }; }
    } catch (e) {
      return { output: null, refused: false, model, usage: null, error: e instanceof Anthropic.APIError ? `anthropic ${e.status ?? "request failed"}` : "anthropic request failed" };
    }
  };
}

/** Claude, when the server has an Anthropic key: Opus 5 to understand — a reading job — and Fable 5.1 to plan — the judgement. */
export const CLAUDE_UNDERSTAND_MODEL = "claude-opus-5";
export const CLAUDE_PLAN_MODEL = "claude-fable-5-1";
/**
 * Room and patience, measured rather than guessed (17 Sep): fifty saves at medium effort spent
 * 3,000 tokens thinking and never answered. On the Responses API the thinking counts against the
 * same cap as the answer, so the cap is a ceiling on cost, not a target — a run costs what it
 * uses. On OpenAI the call runs as a background job, so the patience here is only Claude's; the
 * job's own limit is the weave's (JOB_MAX_MS), however many workers it takes.
 */
export const UNDERSTAND_OPTIONS: WeaveModelOptions = { maxTokens: 25_000, effort: "medium", timeoutMs: 180_000 };
export const PLAN_OPTIONS: WeaveModelOptions = { maxTokens: 50_000, effort: "high", timeoutMs: 240_000 };

/** OpenAI, which is what this server runs on (Pranav, 16 Sep): the sorter's own model for both stages, at a fraction of Fable's price. */
export const OPENAI_MODEL = "gpt-5.6-sol";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

interface ResponsesReply {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  model?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: Parameters<typeof normaliseUsage>[0];
  error?: { message?: string; type?: string } | null;
}

/**
 * A model call that may outlast the worker asking it — a long plan thinks for longer than a worker
 * lives (400 s; a 32-stop week was cut off at 240 s on 2 Oct). Started, and its id kept on the
 * weave's row; then looked at until it has answered, by this worker or a fresh one after it.
 */
export interface WeaveJob {
  /**
   * Asks; hands back the id to look at — or the answer itself, when it came at once or the ask was
   * refused. `timeoutMs` is the most the asking may take: a provider that answers in the asking
   * stops then; one that works in the background answers the asking in moments and ignores it.
   */
  start(system: string, user: string, schema: Record<string, unknown>, timeoutMs?: number): Promise<{ id: string } | { result: ModelResult }>;
  /** The answer once there is one; null while it is still being worked on. */
  check(id: string): Promise<ModelResult | null>;
  /** Stops a job nobody will read. */
  cancel(id: string): Promise<void>;
}

/** A provider that answers in the asking (Claude here): the answer is handed over at once. */
export function jobFromCall(call: WeaveCall): WeaveJob {
  return {
    start: async (system, user, schema, timeoutMs) => ({ result: await call(system, user, schema, timeoutMs) }),
    check: async () => null,
    cancel: async () => {},
  };
}

/** Each HTTP request to OpenAI is short now — the model's thinking happens between them. */
const HTTP_TIMEOUT_MS = 30_000;
const STILL_WORKING = new Set(["queued", "in_progress"]);

/** A finished response read the way the sorter reads one: its answer, usage and model, or why there isn't one. */
function readReply(body: ResponsesReply, model: string): ModelResult {
  const used = body.model ?? model;
  const usage = normaliseUsage(body.usage);
  if (body.status === "failed") return { output: null, refused: false, model: used, usage, error: `failed: ${(body.error?.message ?? "unknown").slice(0, 200)}` };
  if (body.status === "cancelled") return { output: null, refused: false, model: used, usage, error: "cancelled" };
  const message = (body.output ?? []).find((o) => o.type === "message");
  if (message?.content?.some((c) => c.type === "refusal")) return { output: null, refused: true, model: used, usage };
  if (body.status === "incomplete") return { output: null, refused: false, model: used, usage, error: `incomplete: ${body.incomplete_details?.reason ?? "unknown"}` };
  const text = (message?.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
  try { return { output: JSON.parse(text), refused: false, model: used, usage }; }
  catch { return { output: null, refused: false, model: used, usage, error: "model returned non-JSON" }; }
}

/**
 * The call through OpenAI's Responses API in background mode: instructions, a strict JSON schema,
 * reasoning at the effort asked. With store false, OpenAI keeps the job only for about ten minutes,
 * to be looked at — nothing is kept as today. The job runs at OpenAI, not in the worker; the worker
 * only asks and looks.
 */
export function weaveJobOpenAI(apiKey: string, model: string, options: WeaveModelOptions, fetchImpl: typeof fetch = fetch): WeaveJob {
  const request = async (path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: ResponsesReply }> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${OPENAI_ENDPOINT}${path}`, { ...init, signal: ctrl.signal, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" } });
      return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as ResponsesReply };
    } finally { clearTimeout(t); }
  };
  const httpError = (status: number, body: ResponsesReply): ModelResult => ({ output: null, refused: false, model, usage: null, error: `openai ${status}: ${(body.error?.message ?? "").slice(0, 200)}` });
  return {
    async start(system, user, schema) {
      try {
        const r = await request("", {
          method: "POST",
          body: JSON.stringify({
            model, instructions: system, input: user, background: true, store: false,
            reasoning: { effort: options.effort },
            text: { format: { type: "json_schema", name: "weave", schema, strict: true } },
            max_output_tokens: options.maxTokens,
          }),
        });
        if (!r.ok) return { result: httpError(r.status, r.body) };
        if (r.body.id && STILL_WORKING.has(r.body.status ?? "")) return { id: r.body.id };
        return { result: readReply(r.body, model) };
      } catch (e) {
        return { result: { output: null, refused: false, model, usage: null, error: String(e).slice(0, 300) } };
      }
    },
    async check(id) {
      try {
        const r = await request(`/${encodeURIComponent(id)}`, { method: "GET" });
        // Busy or down for a moment is not an answer: looked at again on the next turn, within the job's own limit.
        if (r.status === 429 || r.status >= 500) return null;
        if (!r.ok) return httpError(r.status, r.body);
        if (STILL_WORKING.has(r.body.status ?? "")) return null;
        return readReply(r.body, model);
      } catch {
        // A look that failed is not an answer: looked at again on the next turn.
        return null;
      }
    },
    async cancel(id) {
      await request(`/${encodeURIComponent(id)}/cancel`, { method: "POST" }).catch(() => undefined);
    },
  };
}
