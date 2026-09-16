/**
 * What a Supabase function answered when a call failed. supabase-js reports every non-2xx as
 * "Edge Function returned a non-2xx status code" and keeps the failed response as
 * `error.context`; the function's own explanation is in that body as `{ error, code }`.
 *
 * The response is judged by its shape, never by `instanceof Response`: Expo replaces the global
 * fetch with its own (expo/fetch), whose responses implement Response without descending from the
 * polyfill's class, so an instanceof check is false on every phone and the message is lost.
 */
export interface ServerSaid { error?: string; code?: string }

interface ResponseLike { clone(): ResponseLike; json(): Promise<unknown> }

const responseLike = (x: unknown): x is ResponseLike =>
  typeof x === "object" && x !== null && typeof (x as ResponseLike).clone === "function" && typeof (x as ResponseLike).json === "function";

export async function serverSaid(error: unknown): Promise<ServerSaid | null> {
  const context: unknown = (error as { context?: unknown } | null)?.context;
  if (!responseLike(context)) return null;
  try {
    const body = (await context.clone().json()) as { error?: unknown; code?: unknown } | null;
    const said: ServerSaid = {};
    if (typeof body?.error === "string" && body.error) said.error = body.error;
    if (typeof body?.code === "string" && body.code) said.code = body.code;
    return said.error || said.code ? said : null;
  } catch {
    return null; // not JSON: the gateway or the runtime spoke, not the function
  }
}
