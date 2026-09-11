import type { ApiError, ApiErrorCode } from "./contracts.ts";

const STATUS: Record<ApiErrorCode, number> = { bad_request: 400, unauthorized: 401, not_found: 404, rate_limited: 429, internal: 500 };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export function apiError(code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: message, code };
  return json(body, STATUS[code]);
}

/** Parses a JSON object body; returns null for invalid JSON or non-object values. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await req.json();
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}
