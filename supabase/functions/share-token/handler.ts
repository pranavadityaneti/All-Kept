import { apiError, json, readJson } from "../_shared/http.ts";

export type SharePlatform = "ios" | "android";

export interface ShareTokenDeps {
  userId(req: Request): Promise<string | null>;
  newToken(): string;
  hash(token: string): Promise<string>;
  /** Revokes the caller's live token for the platform and records the new hash. */
  issue(userId: string, platform: SharePlatform, tokenHash: string): Promise<void>;
  revoke(userId: string, platform: SharePlatform): Promise<void>;
}

export async function handleShareToken(req: Request, deps: ShareTokenDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");
  const body = await readJson(req);
  const platform = body?.["platform"];
  if (platform !== "ios" && platform !== "android") return apiError("bad_request", "platform must be ios or android.");
  const action = body?.["action"];
  if (action === "revoke") {
    await deps.revoke(userId, platform);
    return json({ revoked: true });
  }
  if (action !== "create") return apiError("bad_request", "action must be create or revoke.");
  const token = deps.newToken();
  await deps.issue(userId, platform, await deps.hash(token));
  return json({ token });
}
