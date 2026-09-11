# Share-sheet save (Pocket-style) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharing a link to Allkept saves it on the spot and shows a banner in the share sheet on iOS and Android, without opening the app; offline shares queue and sync later.

**Architecture:** A scoped save token (server-hashed, per install, revocable) lets a native iOS share extension and a native Android share activity call `save-link` without the app's session. A local Expo module stores the credential and an offline queue where both processes can reach them; the app mints the token after sign-in and flushes the queue on foreground. The old expo-sharing hand-off is removed.

**Tech Stack:** Supabase (Postgres migration, Deno edge functions), Expo Modules API (Swift + Kotlin local module), `@bacons/apple-targets` for the iOS extension target, WorkManager on Android, vitest + Deno tests.

Spec: `docs/superpowers/specs/2026-09-11-share-extension-save-design.md`.

**Approval gates inside this plan (Pranav's rules):** deleting files (Task 11), pushing the migration (Task 2), deploying functions (Task 6), EAS builds (Task 13). Each step says STOP where it applies.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/…` (the `ApiErrorCode` union) | add `rate_limited`; synced to `supabase/functions/_shared/contracts.ts` |
| `supabase/functions/_shared/http.ts` | `rate_limited → 429` |
| `supabase/migrations/20260911150000_share_tokens.sql` | `share_tokens` table + `use_share_token()` |
| `supabase/tests/share_tokens.sql` | DB contract test (rolled back) |
| `supabase/functions/_shared/share-token.ts` | token generation, hashing, request → user id, rate-limit error |
| `supabase/functions/share-token/{handler,index}.ts` | create / revoke |
| `supabase/functions/save-link/{handler,index}.ts` | accept `X-Share-Token`; 429 on rate limit |
| `supabase/functions/tests/share-token.test.ts`, `share-token-auth.test.ts` | Deno tests |
| `supabase/config.toml` | `verify_jwt = false` for `save-link`, `share-token` |
| `apps/mobile/modules/share-save/**` | local Expo module: JS API, Swift module, Kotlin module + `ShareActivity` + `ShareWorker` |
| `apps/mobile/targets/share/**` | iOS share extension (config, Info.plist, Swift) |
| `apps/mobile/scripts/check-shared-store.sh` | proves the two `SharedStore.swift` copies are identical |
| `apps/mobile/lib/share-save.ts` + `test/share-save.test.ts` | mint / revoke / flush |
| `apps/mobile/lib/supabase.ts` | export URL and anon key |
| `apps/mobile/app/_layout.tsx`, `app/save.tsx`, `app/(tabs)/settings.tsx`, `lib/account.ts` | wiring; removal of the old hand-off |
| `apps/mobile/app.config.ts` | plugins, entitlements, team id |

---

### Task 1: `rate_limited` error code

**Files:**
- Modify: the `ApiErrorCode` union in `packages/contracts/src/` (find it with `grep -rn '"not_found"' packages/contracts/src`)
- Modify: `supabase/functions/_shared/http.ts:3`

- [ ] **Step 1: Add the code to the contracts union**

Find the line that reads (spacing may differ):
```ts
export type ApiErrorCode = "bad_request" | "unauthorized" | "not_found" | "internal";
```
and make it:
```ts
export type ApiErrorCode = "bad_request" | "unauthorized" | "not_found" | "rate_limited" | "internal";
```

- [ ] **Step 2: Sync the shared copy and run the drift test**

Run (repo root): `source ~/.nvm/nvm.sh && npm run sync:shared && npm test -w packages/contracts`
Expected: the sync writes `supabase/functions/_shared/contracts.ts`; the drift test passes.

- [ ] **Step 3: Map it to 429**

`supabase/functions/_shared/http.ts` line 3 becomes:
```ts
const STATUS: Record<ApiErrorCode, number> = { bad_request: 400, unauthorized: 401, not_found: 404, rate_limited: 429, internal: 500 };
```

- [ ] **Step 4: Commit**

```bash
git add packages/contracts supabase/functions/_shared/contracts.ts supabase/functions/_shared/http.ts && git commit -m "A rate_limited error code, answered with 429"
```

---

### Task 2: The `share_tokens` table

**Files:**
- Create: `supabase/migrations/20260911150000_share_tokens.sql`
- Create: `supabase/tests/share_tokens.sql`

- [ ] **Step 1: Write the DB test first**

`supabase/tests/share_tokens.sql`:
```sql
begin;
insert into auth.users(id) values('20000000-0000-0000-0000-000000000001');
-- Service-role behaviour: issue, use, count, revoke.
insert into public.share_tokens(user_id, platform, token_hash) values('20000000-0000-0000-0000-000000000001','ios','hash-a');
do $$
declare r record;
begin
  select * into r from public.use_share_token('hash-a');
  assert r.user_id = '20000000-0000-0000-0000-000000000001' and r.uses = 1, 'first use returns the owner and a count of one';
  select * into r from public.use_share_token('hash-a');
  assert r.uses = 2, 'uses accumulate inside the hour';
  update public.share_tokens set window_start = now() - interval '2 hours' where token_hash = 'hash-a';
  select * into r from public.use_share_token('hash-a');
  assert r.uses = 1, 'a new hour starts the count again';
  assert not exists(select 1 from public.use_share_token('hash-none')), 'an unknown token returns nothing';
  update public.share_tokens set revoked_at = now() where token_hash = 'hash-a';
  assert not exists(select 1 from public.use_share_token('hash-a')), 'a revoked token returns nothing';
end $$;
-- Clients cannot see or call any of it.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
do $$
begin
  assert not exists(select 1 from public.share_tokens), 'tokens are invisible to clients';
  begin
    perform public.use_share_token('hash-a');
    raise exception 'client could call use_share_token';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
```

- [ ] **Step 2: Run it against the hosted project — expect failure (the table does not exist)**

Run (repo root): `source ~/.nvm/nvm.sh && npx supabase db query --linked "$(cat supabase/tests/share_tokens.sql)" 2>&1 | grep -iE "error" | head -2`
Expected: `relation "public.share_tokens" does not exist`. (The script is `begin … rollback`; the Management API runs it as one transaction — verified 11 Sep.)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260911150000_share_tokens.sql`:
```sql
-- A save token is the credential the share extension uses to create saves without holding the
-- app's session (refresh tokens rotate on use, so a session cannot be shared across processes).
-- One live token per user and platform. Only its hash is stored; the plaintext lives on the phone.
create table public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  window_start timestamptz,
  window_uses int not null default 0,
  revoked_at timestamptz
);
create index share_tokens_live_idx on public.share_tokens(user_id, platform) where revoked_at is null;
alter table public.share_tokens enable row level security;
-- No policies on purpose: only the edge functions (service role) read or write this table.

-- Consumes one use of a live token inside a rolling hour and returns its owner and the count so far.
-- Nothing comes back for an unknown or revoked token. The caller decides what "too many" is.
create or replace function public.use_share_token(p_hash text)
returns table(user_id uuid, uses int)
language sql security definer set search_path = '' as $$
  update public.share_tokens t set
    last_used_at = now(),
    window_start = case when t.window_start is null or t.window_start < now() - interval '1 hour' then now() else t.window_start end,
    window_uses  = case when t.window_start is null or t.window_start < now() - interval '1 hour' then 1 else t.window_uses + 1 end
  where t.token_hash = p_hash and t.revoked_at is null
  returning t.user_id, t.window_uses;
$$;
revoke all on function public.use_share_token(text) from public, anon, authenticated;
```

- [ ] **Step 4: STOP — ask Pranav to confirm the push, then push and re-run the test**

Run: `source ~/.nvm/nvm.sh && npx supabase db push --dry-run 2>&1 | tail -3` — expect exactly this one migration. After the yes:
```bash
source ~/.nvm/nvm.sh && npx supabase db push --yes 2>&1 | tail -2 && npx supabase db query --linked "$(cat supabase/tests/share_tokens.sql)" 2>&1 | grep -iE "error" || echo "share_tokens test passes"
```
Expected: `share_tokens test passes`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911150000_share_tokens.sql supabase/tests/share_tokens.sql && git commit -m "Save tokens: a per-install credential for the share extension, hashed, rate-counted, revocable"
```

---

### Task 3: Token helpers in `_shared`

**Files:**
- Create: `supabase/functions/_shared/share-token.ts`
- Create: `supabase/functions/tests/share-token-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

`supabase/functions/tests/share-token-auth.test.ts`:
```ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { hashShareToken, newShareToken, SHARE_TOKEN_HEADER, ShareTokenRateLimited, userIdFromShareToken, type ShareTokenLookup } from "../_shared/share-token.ts";

const req = (token?: string) => new Request("https://example.test/save-link", { method: "POST", headers: token ? { [SHARE_TOKEN_HEADER]: token } : {} });
function lookup(rows: Record<string, { userId: string; uses: number }>): ShareTokenLookup & { asked: string[] } {
  const asked: string[] = [];
  return { asked, use: async (hash) => { asked.push(hash); return rows[hash] ?? null; } };
}

Deno.test("a new token is long, url-safe and hashes to 64 hex characters", async () => {
  const token = newShareToken();
  assertEquals(/^[A-Za-z0-9_-]{43}$/.test(token), true);
  assertEquals(/^[0-9a-f]{64}$/.test(await hashShareToken(token)), true);
  assertEquals(await hashShareToken(token), await hashShareToken(token));
});
Deno.test("the header resolves to the owner by hash, never by plaintext", async () => {
  const token = newShareToken();
  const l = lookup({ [await hashShareToken(token)]: { userId: "owner", uses: 3 } });
  assertEquals(await userIdFromShareToken(req(token), l), "owner");
  assertEquals(l.asked.includes(token), false);
});
Deno.test("no header, a malformed header, or an unknown token gives nobody", async () => {
  const l = lookup({});
  assertEquals(await userIdFromShareToken(req(), l), null);
  assertEquals(await userIdFromShareToken(req("short"), l), null);
  assertEquals(await userIdFromShareToken(req(newShareToken()), l), null);
});
Deno.test("past the hourly limit the request is refused, not silently treated as signed out", async () => {
  const token = newShareToken();
  const l = lookup({ [await hashShareToken(token)]: { userId: "owner", uses: 121 } });
  await assertRejects(() => userIdFromShareToken(req(token), l), ShareTokenRateLimited);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `source ~/.nvm/nvm.sh && npm run test:functions 2>&1 | grep -E "share-token-auth|error|FAILED" | head -5`
Expected: module not found for `../_shared/share-token.ts`.

- [ ] **Step 3: Write the helpers**

`supabase/functions/_shared/share-token.ts`:
```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SHARE_TOKEN_HEADER = "x-share-token";
/** Saves per token per rolling hour. Generous for a person, tight for a leaked token. */
export const SHARE_TOKEN_HOURLY_LIMIT = 120;

export class ShareTokenRateLimited extends Error {}

/** 32 random bytes, base64url without padding: what the phone keeps. */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the token, hex. The plaintext never reaches the database or the logs. */
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ShareTokenLookup {
  /** Records one use of a live token and returns its owner with the hour's count, or null. */
  use(hash: string): Promise<{ userId: string; uses: number } | null>;
}

/** The user behind a request carrying a save token, or null. Throws ShareTokenRateLimited past the limit. */
export async function userIdFromShareToken(req: Request, lookup: ShareTokenLookup): Promise<string | null> {
  const token = req.headers.get(SHARE_TOKEN_HEADER)?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const used = await lookup.use(await hashShareToken(token));
  if (!used) return null;
  if (used.uses > SHARE_TOKEN_HOURLY_LIMIT) throw new ShareTokenRateLimited();
  return used.userId;
}

export function shareTokenLookup(db: SupabaseClient): ShareTokenLookup {
  return {
    async use(hash) {
      const { data, error } = await db.rpc("use_share_token", { p_hash: hash });
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const row = data[0] as { user_id: string; uses: number };
      return { userId: row.user_id, uses: row.uses };
    },
  };
}
```

- [ ] **Step 4: Run the tests — green**

Run: `source ~/.nvm/nvm.sh && npm run test:functions 2>&1 | grep -E "share-token-auth|ok \||FAILED|passed" | head -6`
Expected: 4 passed for this file; nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/share-token.ts supabase/functions/tests/share-token-auth.test.ts && git commit -m "Share tokens: generate, hash, resolve a request to its owner, refuse a flood"
```

---

### Task 4: The `share-token` function

**Files:**
- Create: `supabase/functions/share-token/handler.ts`
- Create: `supabase/functions/share-token/index.ts`
- Create: `supabase/functions/tests/share-token.test.ts`

- [ ] **Step 1: Failing tests**

`supabase/functions/tests/share-token.test.ts`:
```ts
import { assertEquals } from "jsr:@std/assert@1";
import { handleShareToken, type ShareTokenDeps } from "../share-token/handler.ts";

const req = (body: unknown) => new Request("https://example.test/share-token", { method: "POST", body: JSON.stringify(body) });
function fake(userId: string | null = "owner") {
  const issued: { userId: string; platform: string; hash: string }[] = [];
  const revoked: { userId: string; platform: string }[] = [];
  const deps: ShareTokenDeps = {
    userId: async () => userId,
    newToken: () => "token-plaintext-0123456789abcdefghijklmn",
    hash: async (t) => `hash(${t})`,
    issue: async (u, p, h) => { issued.push({ userId: u, platform: p, hash: h }); },
    revoke: async (u, p) => { revoked.push({ userId: u, platform: p }); },
  };
  return { deps, issued, revoked };
}

Deno.test("create stores only the hash for the caller's platform and returns the plaintext once", async () => {
  const f = fake();
  const res = await handleShareToken(req({ action: "create", platform: "ios", userId: "someone-else" }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { token: "token-plaintext-0123456789abcdefghijklmn" });
  assertEquals(f.issued, [{ userId: "owner", platform: "ios", hash: "hash(token-plaintext-0123456789abcdefghijklmn)" }]);
});
Deno.test("revoke forgets the caller's token for that platform", async () => {
  const f = fake();
  const res = await handleShareToken(req({ action: "revoke", platform: "android" }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(f.revoked, [{ userId: "owner", platform: "android" }]);
  assertEquals(f.issued.length, 0);
});
Deno.test("unauthenticated, bad platform, bad action and GET are refused", async () => {
  assertEquals((await handleShareToken(req({ action: "create", platform: "ios" }), fake(null).deps)).status, 401);
  assertEquals((await handleShareToken(req({ action: "create", platform: "web" }), fake().deps)).status, 400);
  assertEquals((await handleShareToken(req({ action: "rotate", platform: "ios" }), fake().deps)).status, 400);
  assertEquals((await handleShareToken(new Request("https://example.test/share-token"), fake().deps)).status, 400);
});
```

- [ ] **Step 2: Run to see them fail** — `npm run test:functions` reports the missing handler module.

- [ ] **Step 3: Handler**

`supabase/functions/share-token/handler.ts`:
```ts
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
```

- [ ] **Step 4: Entry point**

`supabase/functions/share-token/index.ts`:
```ts
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import { hashShareToken, newShareToken } from "../_shared/share-token.ts";
import { handleShareToken } from "./handler.ts";

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    const revokeLive = async (userId: string, platform: string) => {
      const { error } = await db.from("share_tokens").update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId).eq("platform", platform).is("revoked_at", null);
      if (error) throw error;
    };
    return await handleShareToken(req, {
      userId: userIdFromRequest,
      newToken: newShareToken,
      hash: hashShareToken,
      async issue(userId, platform, tokenHash) {
        await revokeLive(userId, platform);
        const { error } = await db.from("share_tokens").insert({ user_id: userId, platform, token_hash: tokenHash });
        if (error) throw error;
      },
      revoke: revokeLive,
    });
  } catch {
    return apiError("internal", "Could not set up sharing. Please try again.");
  }
});
```

- [ ] **Step 5: Tests green** — `npm run test:functions`: 3 passed for `share-token.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/share-token supabase/functions/tests/share-token.test.ts && git commit -m "share-token: the app mints and revokes the extension's credential"
```

---

### Task 5: `save-link` accepts the token

**Files:**
- Modify: `supabase/functions/save-link/handler.ts:11-14`
- Modify: `supabase/functions/save-link/index.ts:1,14`
- Modify: `supabase/functions/tests/save-link.test.ts` (append)

- [ ] **Step 1: Failing test — append to `save-link.test.ts`**

```ts
import { ShareTokenRateLimited } from "../_shared/share-token.ts";
Deno.test("a flood from one token is answered 429, not 401", async () => {
  const f = fake();
  const deps: SaveLinkDeps = { ...f.deps, userId: async () => { throw new ShareTokenRateLimited(); } };
  const res = await handleSaveLink(req({ text: URL, requestId: "request-123" }), deps);
  assertEquals(res.status, 429);
  assertEquals(f.captured.length, 0);
});
```
(If `fake` already exposes `deps` as shown at the top of the file, this compiles as is.)

- [ ] **Step 2: Run — fails** (the handler lets the error escape: the test sees a rejected promise).

- [ ] **Step 3: Handler — catch the rate limit**

Replace `handler.ts` lines 13–14:
```ts
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in before saving a link.");
```
with:
```ts
  let userId: string | null;
  try { userId = await deps.userId(req); }
  catch (e) {
    if (e instanceof ShareTokenRateLimited) return apiError("rate_limited", "That is a lot of saves at once. Try again in a little while.");
    throw e;
  }
  if (!userId) return apiError("unauthorized", "Sign in before saving a link.");
```
and add the import at the top: `import { ShareTokenRateLimited } from "../_shared/share-token.ts";`

- [ ] **Step 4: Entry point — session first, token second**

In `save-link/index.ts` add `import { shareTokenLookup, userIdFromShareToken } from "../_shared/share-token.ts";` and replace `userId: userIdFromRequest,` with:
```ts
      // A session (the app) or a save token (the share extension). The token never carries a session.
      userId: async (req) => (await userIdFromRequest(req)) ?? userIdFromShareToken(req, shareTokenLookup(db)),
```

- [ ] **Step 5: Tests green** — `npm run test:functions`: all `save-link` tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/save-link supabase/functions/tests/save-link.test.ts && git commit -m "save-link: a save token is as good as a session, up to a limit"
```

---

### Task 6: Gateway JWT off for the two functions, deploy

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Check the current setting**

Run: `grep -n -A2 "functions.save-link\|functions.share-token\|functions.instagram-webhook" supabase/config.toml`
Expected: `instagram-webhook` shows the pattern (`verify_jwt = false`); `save-link` and `share-token` are absent or `true`.

- [ ] **Step 2: Add (or set)**

Append to `supabase/config.toml`, next to the other `[functions.*]` blocks:
```toml
# The share extension carries a save token, not a JWT; the function checks it itself.
[functions.save-link]
verify_jwt = false

[functions.share-token]
verify_jwt = false
```
(`share-token` is only ever called with a session, but the setting keeps both functions on one rule: auth is decided in code.)

- [ ] **Step 3: STOP — ask Pranav to confirm the deploy, then deploy both**

```bash
source ~/.nvm/nvm.sh && npx supabase functions deploy save-link --no-verify-jwt && npx supabase functions deploy share-token --no-verify-jwt
```
Expected: both report deployed. Then prove the session path still works and the token path answers 401 for garbage:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/save-link" -H "Content-Type: application/json" -H "X-Share-Token: not-a-real-token-not-a-real-token-1234" -d '{"text":"https://example.com","requestId":"request-123"}'
```
Expected: `401`.

- [ ] **Step 4: Commit** — `git add supabase/config.toml && git commit -m "save-link and share-token decide auth in code, not at the gateway"`

---

### Task 7: The app-side library, test-first

**Files:**
- Create: `apps/mobile/modules/share-save/index.ts` (JS surface only; native comes in Tasks 8–9)
- Create: `apps/mobile/lib/share-save.ts`
- Create: `apps/mobile/test/share-save.test.ts`
- Modify: `apps/mobile/lib/supabase.ts` (export the URL and key)

- [ ] **Step 1: Failing tests**

`apps/mobile/test/share-save.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  has: vi.fn(), set: vi.fn(), clear: vi.fn(), peek: vi.fn(), drop: vi.fn(), invoke: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../modules/share-save", () => ({ hasCredential: mocks.has, setCredential: mocks.set, clearCredential: mocks.clear, peekQueue: mocks.peek, dropQueued: mocks.drop }));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } }, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" }));
vi.mock("../lib/library", () => ({ invalidateLibrary: mocks.invalidate }));
import { ensureShareToken, flushShareQueue, revokeShareToken } from "../lib/share-save";
const queryClient = {} as never;
const httpError = (status: number) => ({ context: { status } });

beforeEach(() => { vi.clearAllMocks(); mocks.has.mockReturnValue(false); mocks.peek.mockReturnValue([]); });

describe("share token", () => {
  it("mints once per install and hands the extension the endpoint and key", async () => {
    mocks.invoke.mockResolvedValue({ data: { token: "tok" }, error: null });
    await ensureShareToken();
    expect(mocks.invoke).toHaveBeenCalledWith("share-token", { body: { action: "create", platform: "ios" } });
    expect(mocks.set).toHaveBeenCalledWith({ token: "tok", endpoint: "https://x.supabase.co/functions/v1/save-link", apikey: "anon" });
    mocks.has.mockReturnValue(true);
    await ensureShareToken();
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it("a failed mint leaves nothing behind and is retried next time", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(500) });
    await ensureShareToken();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("revoke tells the server and forgets locally even if the server is unreachable", async () => {
    mocks.invoke.mockRejectedValue(new Error("offline"));
    await revokeShareToken();
    expect(mocks.invoke).toHaveBeenCalledWith("share-token", { body: { action: "revoke", platform: "ios" } });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
describe("offline queue", () => {
  it("delivers each queued share with its own request id, drops it, and refreshes the library", async () => {
    mocks.peek.mockReturnValue([{ text: "https://a.example", requestId: "r1", at: 1 }, { text: "https://b.example", requestId: "r2", at: 2 }]);
    mocks.invoke.mockResolvedValue({ data: { itemId: "item" }, error: null });
    expect(await flushShareQueue(queryClient)).toBe(2);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "save-link", { body: { text: "https://a.example", requestId: "r1" } });
    expect(mocks.drop.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it("drops what can never be a link, and stops at the first network failure", async () => {
    mocks.peek.mockReturnValue([{ text: "hello", requestId: "r1", at: 1 }, { text: "https://b.example", requestId: "r2", at: 2 }, { text: "https://c.example", requestId: "r3", at: 3 }]);
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(400) }).mockResolvedValueOnce({ data: null, error: httpError(0) });
    expect(await flushShareQueue(queryClient)).toBe(0);
    expect(mocks.drop.mock.calls.map((c) => c[0])).toEqual(["r1"]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails** (`../lib/share-save` missing): `cd apps/mobile && npx vitest run test/share-save.test.ts`

- [ ] **Step 3: Export the config values**

In `apps/mobile/lib/supabase.ts`, after `const anonKey = …;` add:
```ts
/** Handed to the share extension at runtime, so nothing is compiled into native code. */
export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;
```

- [ ] **Step 4: The module's JS surface**

`apps/mobile/modules/share-save/index.ts`:
```ts
import { requireNativeModule } from "expo-modules-core";

export type ShareCredential = { token: string; endpoint: string; apikey: string };
export type QueuedShare = { text: string; requestId: string; at: number };

type Native = {
  setCredential(json: string): void;
  clearCredential(): void;
  hasCredential(): boolean;
  peekQueue(): string;
  dropQueued(requestId: string): void;
};
const native = requireNativeModule<Native>("ShareSave");

/** What the share extension needs to save on its own: the token, where to send it, and the anon key. */
export function setCredential(credential: ShareCredential): void { native.setCredential(JSON.stringify(credential)); }
export function clearCredential(): void { native.clearCredential(); }
export function hasCredential(): boolean { return native.hasCredential(); }
/** What the extension queued while offline. Read-only: drop each entry once it has been delivered. */
export function peekQueue(): QueuedShare[] {
  try {
    const parsed: unknown = JSON.parse(native.peekQueue() || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is QueuedShare =>
      typeof q === "object" && q !== null && typeof (q as QueuedShare).text === "string" && typeof (q as QueuedShare).requestId === "string");
  } catch { return []; }
}
export function dropQueued(requestId: string): void { native.dropQueued(requestId); }
```

- [ ] **Step 5: The library**

`apps/mobile/lib/share-save.ts`:
```ts
import type { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { clearCredential, dropQueued, hasCredential, peekQueue, setCredential } from "../modules/share-save";
import { invalidateLibrary } from "./library";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

const platform = (): "ios" | "android" => (Platform.OS === "android" ? "android" : "ios");

/** Mints the share extension's credential once per install; the module remembers it. A failure is retried next foreground. */
export async function ensureShareToken(): Promise<void> {
  if (hasCredential()) return;
  const { data, error } = await supabase.functions.invoke<{ token: string }>("share-token", { body: { action: "create", platform: platform() } });
  if (error || !data?.token) return;
  setCredential({ token: data.token, endpoint: `${supabaseUrl}/functions/v1/save-link`, apikey: supabaseAnonKey });
}

/** Sign-out and account deletion: the server forgets the token, and so does the phone — even offline. */
export async function revokeShareToken(): Promise<void> {
  await supabase.functions.invoke("share-token", { body: { action: "revoke", platform: platform() } }).catch(() => undefined);
  clearCredential();
}

const statusOf = (error: unknown): number | undefined => (error as { context?: { status?: number } } | null)?.context?.status;

/**
 * Delivers what the extension queued while offline, each with the request id it was queued under,
 * so a retry can never double-save. Stops at the first network failure; runs again next foreground.
 */
export async function flushShareQueue(queryClient: QueryClient): Promise<number> {
  let delivered = 0;
  for (const item of peekQueue()) {
    const { data, error } = await supabase.functions.invoke<{ itemId?: string }>("save-link", { body: { text: item.text, requestId: item.requestId } });
    if (error) {
      if (statusOf(error) === 400) { dropQueued(item.requestId); continue; } // never going to be a link
      break;
    }
    if (data?.itemId) { dropQueued(item.requestId); delivered++; }
  }
  if (delivered) invalidateLibrary(queryClient);
  return delivered;
}
```

- [ ] **Step 6: Tests green** — `npx vitest run test/share-save.test.ts`: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/modules/share-save/index.ts apps/mobile/lib/share-save.ts apps/mobile/lib/supabase.ts apps/mobile/test/share-save.test.ts && git commit -m "The app mints the share extension's token and delivers what it queued"
```

---

### Task 8: The native module — iOS

**Files:**
- Create: `apps/mobile/modules/share-save/expo-module.config.json`
- Create: `apps/mobile/modules/share-save/ios/ShareSave.podspec`
- Create: `apps/mobile/modules/share-save/ios/SharedStore.swift`
- Create: `apps/mobile/modules/share-save/ios/ShareSaveModule.swift`

- [ ] **Step 1: Module config**

`expo-module.config.json`:
```json
{
  "platforms": ["apple", "android"],
  "apple": { "modules": ["ShareSaveModule"] },
  "android": { "modules": ["app.allkept.sharesave.ShareSaveModule"] }
}
```

- [ ] **Step 2: Podspec**

`ios/ShareSave.podspec`:
```ruby
Pod::Spec.new do |s|
  s.name             = 'ShareSave'
  s.version          = '1.0.0'
  s.summary          = 'Credential and offline queue shared with the Allkept share extension'
  s.author           = 'Allkept'
  s.homepage         = 'https://www.allkept.app'
  s.license          = { type: 'UNLICENSED' }
  s.platforms        = { ios: '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
```

- [ ] **Step 3: SharedStore (the copy the app uses)**

`ios/SharedStore.swift`:
```swift
import Foundation
import Security

/// Everything the app and its share extension have in common: one credential in the keychain and
/// one queue file, both reachable through the app group so either process can use them.
/// KEEP IDENTICAL to targets/share/SharedStore.swift — scripts/check-shared-store.sh compares them.
enum SharedStore {
  static let appGroup = "group.app.allkept.mobile"
  static let service = "app.allkept.share-save"
  static let account = "credential"
  static let queueFile = "share-queue.json"

  struct Credential: Codable { let token: String; let endpoint: String; let apikey: String }
  struct Queued: Codable { let text: String; let requestId: String; let at: Double }

  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: account,
     kSecAttrAccessGroup as String: appGroup]
  }

  static func setCredential(_ credential: Credential) throws {
    let data = try JSONEncoder().encode(credential)
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw NSError(domain: "ShareSave", code: Int(status)) }
  }

  static func credential() -> Credential? {
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(read as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return try? JSONDecoder().decode(Credential.self, from: data)
  }

  static func clearCredential() { SecItemDelete(query as CFDictionary) }

  private static var queueURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent(queueFile)
  }
  private static let lock = NSLock()

  static func queue() -> [Queued] {
    guard let url = queueURL, let data = try? Data(contentsOf: url) else { return [] }
    return (try? JSONDecoder().decode([Queued].self, from: data)) ?? []
  }

  static func enqueue(text: String, requestId: String) {
    lock.lock(); defer { lock.unlock() }
    write(queue() + [Queued(text: text, requestId: requestId, at: Date().timeIntervalSince1970 * 1000)])
  }

  static func drop(requestId: String) {
    lock.lock(); defer { lock.unlock() }
    write(queue().filter { $0.requestId != requestId })
  }

  private static func write(_ items: [Queued]) {
    guard let url = queueURL, let data = try? JSONEncoder().encode(items) else { return }
    try? data.write(to: url, options: .atomic)
  }
}
```

- [ ] **Step 4: The module**

`ios/ShareSaveModule.swift`:
```swift
import ExpoModulesCore

public class ShareSaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShareSave")

    Function("setCredential") { (json: String) throws in
      let credential = try JSONDecoder().decode(SharedStore.Credential.self, from: Data(json.utf8))
      try SharedStore.setCredential(credential)
    }
    Function("clearCredential") { SharedStore.clearCredential() }
    Function("hasCredential") { () -> Bool in SharedStore.credential() != nil }
    Function("peekQueue") { () -> String in
      let data = (try? JSONEncoder().encode(SharedStore.queue())) ?? Data("[]".utf8)
      return String(decoding: data, as: UTF8.self)
    }
    Function("dropQueued") { (requestId: String) in SharedStore.drop(requestId: requestId) }
  }
}
```

- [ ] **Step 5: Commit** — `git add apps/mobile/modules/share-save && git commit -m "ShareSave module, iOS: keychain credential and app-group queue"`

---

### Task 9: The native module — Android

**Files:**
- Create: `apps/mobile/modules/share-save/android/build.gradle`
- Create: `apps/mobile/modules/share-save/android/src/main/AndroidManifest.xml`
- Create: `…/android/src/main/java/app/allkept/sharesave/{SharedStore,SaveClient,ShareActivity,ShareWorker,ShareSaveModule}.kt`

- [ ] **Step 1: Gradle**

`android/build.gradle`:
```groovy
// SDK 57 pattern (copied from expo-secure-store): the expo-module-gradle-plugin supplies compileSdk,
// Kotlin, the core dependency and publishing. The older apply-from helpers fail with "does not
// specify compileSdk" — that was the first Gradle run's error on 12 Sep.
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'app.allkept.sharesave'
version = '1.0.0'

android {
  namespace "app.allkept.sharesave"
  defaultConfig {
    versionCode 1
    versionName '1.0.0'
  }
}

dependencies {
  implementation "androidx.work:work-runtime-ktx:2.9.1"
}
```

- [ ] **Step 2: Manifest — the share activity, no app launch**

`android/src/main/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <!-- Receives "Share" from any app, saves, shows a toast, finishes. Never launches Allkept. -->
    <activity
      android:name="app.allkept.sharesave.ShareActivity"
      android:exported="true"
      android:excludeFromRecents="true"
      android:noHistory="true"
      android:theme="@android:style/Theme.Translucent.NoTitleBar">
      <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
      </intent-filter>
    </activity>
  </application>
</manifest>
```

- [ ] **Step 3: SharedStore**

`SharedStore.kt`:
```kotlin
package app.allkept.sharesave

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The credential and the offline queue, in the app's private storage. The share activity runs
 * inside the app's own sandbox, so nothing needs to cross a process boundary.
 */
object SharedStore {
  private const val PREFS = "app.allkept.share-save"
  private const val KEY = "credential"
  private const val QUEUE = "share-queue.json"
  private val lock = Any()

  data class Credential(val token: String, val endpoint: String, val apikey: String)
  data class Queued(val text: String, val requestId: String, val at: Long)

  fun setCredential(context: Context, json: String) {
    parse(json) ?: throw IllegalArgumentException("credential must carry token, endpoint and apikey")
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }
  fun credential(context: Context): Credential? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let { parse(it) }
  fun clearCredential(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
  private fun parse(json: String): Credential? = try {
    val o = JSONObject(json)
    Credential(o.getString("token"), o.getString("endpoint"), o.getString("apikey"))
  } catch (_: Exception) { null }

  fun queue(context: Context): List<Queued> = synchronized(lock) { read(context) }
  fun queueJson(context: Context): String = synchronized(lock) { toJson(read(context)).toString() }
  fun enqueue(context: Context, text: String, requestId: String) = synchronized(lock) {
    write(context, read(context) + Queued(text, requestId, System.currentTimeMillis()))
  }
  fun drop(context: Context, requestId: String) = synchronized(lock) {
    write(context, read(context).filter { it.requestId != requestId })
  }

  private fun file(context: Context) = File(context.filesDir, QUEUE)
  private fun read(context: Context): List<Queued> {
    val f = file(context)
    if (!f.exists()) return emptyList()
    return try {
      val arr = JSONArray(f.readText())
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        Queued(o.getString("text"), o.getString("requestId"), o.optLong("at"))
      }
    } catch (_: Exception) { emptyList() }
  }
  private fun write(context: Context, items: List<Queued>) { file(context).writeText(toJson(items).toString()) }
  private fun toJson(items: List<Queued>) = JSONArray().apply {
    items.forEach { put(JSONObject().put("text", it.text).put("requestId", it.requestId).put("at", it.at)) }
  }
}
```

- [ ] **Step 4: SaveClient — one POST, one outcome**

`SaveClient.kt`:
```kotlin
package app.allkept.sharesave

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** One POST to save-link. The outcome says what to tell the person and whether to keep the item queued. */
object SaveClient {
  enum class Outcome { SAVED, NOT_A_LINK, SIGNED_OUT, RATE_LIMITED, RETRY_LATER }

  fun save(credential: SharedStore.Credential, text: String, requestId: String, timeoutMs: Int = 8000): Outcome = try {
    val conn = (URL(credential.endpoint).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = timeoutMs
      readTimeout = timeoutMs
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("apikey", credential.apikey)
      setRequestProperty("X-Share-Token", credential.token)
    }
    conn.outputStream.use { it.write(JSONObject().put("text", text).put("requestId", requestId).toString().toByteArray()) }
    val code = conn.responseCode
    conn.disconnect()
    when (code) {
      in 200..299 -> Outcome.SAVED
      400 -> Outcome.NOT_A_LINK
      401, 403 -> Outcome.SIGNED_OUT
      429 -> Outcome.RATE_LIMITED
      else -> Outcome.RETRY_LATER
    }
  } catch (_: Exception) { Outcome.RETRY_LATER }
}
```

- [ ] **Step 5: ShareActivity**

`ShareActivity.kt`:
```kotlin
package app.allkept.sharesave

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import java.util.UUID

/**
 * Saves what was shared and gets out of the way. Stays invisible for as long as the request takes
 * (well under a second online, up to eight seconds on a bad connection), then a toast, then gone.
 * Never launches Allkept.
 */
class ShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val app = applicationContext
    val text = if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() else null
    if (text.isNullOrEmpty()) return done("That wasn't a link")
    val credential = SharedStore.credential(app) ?: return done("Open Allkept to sign in")
    val requestId = UUID.randomUUID().toString()
    SharedStore.enqueue(app, text, requestId) // durable first; dropped once the server has it
    Thread {
      val outcome = SaveClient.save(credential, text, requestId)
      val message = when (outcome) {
        SaveClient.Outcome.SAVED -> "Saved to Allkept ✓"
        SaveClient.Outcome.NOT_A_LINK -> "That wasn't a link"
        SaveClient.Outcome.SIGNED_OUT -> "Open Allkept to sign in"
        SaveClient.Outcome.RATE_LIMITED -> "Too many saves at once. Try again soon."
        SaveClient.Outcome.RETRY_LATER -> "Saved to Allkept. Syncs when you're online"
      }
      if (outcome == SaveClient.Outcome.RETRY_LATER) ShareWorker.schedule(app) else SharedStore.drop(app, requestId)
      Handler(Looper.getMainLooper()).post { done(message) }
    }.start()
  }

  private fun done(message: String) {
    Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
    finish()
  }
}
```

- [ ] **Step 6: ShareWorker — delivery without the app**

`ShareWorker.kt`:
```kotlin
package app.allkept.sharesave

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Delivers queued saves once the network is back, without Allkept being opened. */
class ShareWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val app = applicationContext
    val credential = SharedStore.credential(app) ?: return Result.success()
    var retry = false
    for (item in SharedStore.queue(app)) {
      when (SaveClient.save(credential, item.text, item.requestId)) {
        SaveClient.Outcome.RETRY_LATER -> retry = true
        else -> SharedStore.drop(app, item.requestId)
      }
    }
    return if (retry) Result.retry() else Result.success()
  }

  companion object {
    private const val NAME = "app.allkept.share-save.flush"
    fun schedule(context: Context) {
      val request = OneTimeWorkRequestBuilder<ShareWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request)
    }
  }
}
```

- [ ] **Step 7: The module**

`ShareSaveModule.kt`:
```kotlin
package app.allkept.sharesave

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareSaveModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  override fun definition() = ModuleDefinition {
    Name("ShareSave")
    Function("setCredential") { json: String -> SharedStore.setCredential(context, json) }
    Function("clearCredential") { SharedStore.clearCredential(context) }
    Function("hasCredential") { SharedStore.credential(context) != null }
    Function("peekQueue") { SharedStore.queueJson(context) }
    Function("dropQueued") { requestId: String -> SharedStore.drop(context, requestId) }
  }
}
```

- [ ] **Step 8: Commit** — `git add apps/mobile/modules/share-save/android && git commit -m "ShareSave module, Android: share activity, background delivery, private store"`

---

### Task 10: The iOS share extension target

**Files:**
- Create: `apps/mobile/targets/share/expo-target.config.js`
- Create: `apps/mobile/targets/share/Info.plist`
- Create: `apps/mobile/targets/share/SharedStore.swift` (byte-identical copy of the module's)
- Create: `apps/mobile/targets/share/ShareViewController.swift`
- Create: `apps/mobile/scripts/check-shared-store.sh`

- [ ] **Step 1: Target config**

`targets/share/expo-target.config.js`:
```js
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "share",
  name: "AllkeptShare",
  displayName: "Allkept", // what the share sheet shows; defaults to the target name otherwise
  bundleIdentifier: ".share",
  deploymentTarget: "15.1",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.allkept.mobile"],
  },
};
```

- [ ] **Step 2: Info.plist** (unmanaged by the plugin, so it must be complete)

`targets/share/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key><string>Allkept</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsWebURLWithMaxCount</key><integer>1</integer>
        <key>NSExtensionActivationSupportsText</key><true/>
      </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key><string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key><string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 3: Copy SharedStore and add the guard**

```bash
cp apps/mobile/modules/share-save/ios/SharedStore.swift apps/mobile/targets/share/SharedStore.swift
```
`apps/mobile/scripts/check-shared-store.sh`:
```bash
#!/usr/bin/env bash
# The app and its share extension are separate targets; CocoaPods cannot share a source file across
# them, so SharedStore.swift exists twice. This fails the moment the two copies differ.
set -e
cd "$(dirname "$0")/.."
cmp modules/share-save/ios/SharedStore.swift targets/share/SharedStore.swift && echo "SharedStore.swift: both copies identical"
```
`chmod +x apps/mobile/scripts/check-shared-store.sh`, and add to `apps/mobile/package.json` scripts: `"check:shared-store": "bash scripts/check-shared-store.sh"`.

- [ ] **Step 4: The extension**

`targets/share/ShareViewController.swift`:
```swift
import UIKit
import UniformTypeIdentifiers

/// Saves the shared link to Allkept and says so, without opening the app. Online this is well under a
/// second; offline the link waits in the app group and the app delivers it when it next opens.
final class ShareViewController: UIViewController {
  private let banner = PaddedLabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.black.withAlphaComponent(0.001) // keeps the sheet's own dimming
    banner.text = "Saving…"
    banner.textColor = .white
    banner.font = .systemFont(ofSize: 16, weight: .semibold)
    banner.textAlignment = .center
    banner.numberOfLines = 2
    banner.backgroundColor = UIColor(red: 0.08, green: 0.08, blue: 0.11, alpha: 0.94)
    banner.layer.cornerRadius = 16
    banner.layer.masksToBounds = true
    banner.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(banner)
    NSLayoutConstraint.activate([
      banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      banner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      banner.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48),
    ])
    readSharedText { [weak self] text in self?.save(text) }
  }

  /// The first URL item wins; failing that, the first text item. Anything else is not a link.
  private func readSharedText(_ done: @escaping (String?) -> Void) {
    let attachments = (extensionContext?.inputItems as? [NSExtensionItem])?.flatMap { $0.attachments ?? [] } ?? []
    if let urlItem = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
      urlItem.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
        DispatchQueue.main.async { done((item as? URL)?.absoluteString ?? (item as? String)) }
      }
      return
    }
    if let textItem = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
      textItem.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
        DispatchQueue.main.async { done(item as? String) }
      }
      return
    }
    done(nil)
  }

  private func save(_ shared: String?) {
    guard let text = shared?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return finish("That wasn't a link") }
    guard let credential = SharedStore.credential(), let url = URL(string: credential.endpoint) else { return finish("Open Allkept to sign in") }
    let requestId = UUID().uuidString
    var request = URLRequest(url: url, timeoutInterval: 8)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(credential.apikey, forHTTPHeaderField: "apikey")
    request.setValue(credential.token, forHTTPHeaderField: "X-Share-Token")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["text": text, "requestId": requestId])
    URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      DispatchQueue.main.async {
        switch (error == nil, status) {
        case (true, 200...299): self?.finish("Saved to Allkept ✓")
        case (true, 400): self?.finish("That wasn't a link")
        case (true, 401), (true, 403): self?.finish("Open Allkept to sign in")
        case (true, 429): self?.finish("Too many saves at once. Try again soon.")
        default:
          SharedStore.enqueue(text: text, requestId: requestId)
          self?.finish("Saved to Allkept. Syncs when you're online")
        }
      }
    }.resume()
  }

  private func finish(_ message: String) {
    banner.text = message
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }
}

/// A label with room around its text.
final class PaddedLabel: UILabel {
  private let inset = UIEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
  override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: inset)) }
  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(width: size.width + inset.left + inset.right, height: size.height + inset.top + inset.bottom)
  }
}
```

- [ ] **Step 5: Guard passes** — `bash apps/mobile/scripts/check-shared-store.sh` → `both copies identical`.

- [ ] **Step 6: Commit** — `git add apps/mobile/targets apps/mobile/scripts/check-shared-store.sh apps/mobile/package.json && git commit -m "The share extension: save on the spot, say so, get out of the way"`

---

### Task 11: Wire the app, remove the old hand-off

**Files:**
- Modify: `apps/mobile/app.config.ts` (plugins, `ios.entitlements`, `ios.appleTeamId`)
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/save.tsx`, `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/lib/account.ts`
- Delete (STOP for Pranav's yes first): `apps/mobile/lib/pending-share.ts`, `apps/mobile/lib/incoming-share.ts`, `apps/mobile/app/+native-intent.ts`, `apps/mobile/test/pending-share.test.ts`, `apps/mobile/test/incoming-share.test.ts`
- Install: `@bacons/apple-targets`

- [ ] **Step 1: Install the target plugin (dev dependency of the mobile app)**

Run (repo root): `source ~/.nvm/nvm.sh && npm install -D @bacons/apple-targets@5.0.0 -w apps/mobile`

- [ ] **Step 2: Ask Pranav for the Apple Team ID** (App Store Connect → Membership, or the EAS build log "Team ID"). STOP until provided.

- [ ] **Step 3: `app.config.ts`**

Replace the expo-sharing plugin entry (the four lines starting `["expo-sharing", {`) with:
```ts
    // The share sheet is served by our own extension (targets/share) and Android share activity
    // (modules/share-save); expo-sharing stays only for sharing *out*.
    "@bacons/apple-targets",
```
In the `ios` block add, after `usesAppleSignIn: true,`:
```ts
    appleTeamId: "<TEAM ID FROM STEP 2>",
    // The share extension reads the save token and the offline queue through this group.
    entitlements: { "com.apple.security.application-groups": ["group.app.allkept.mobile"] },
```

- [ ] **Step 4: `_layout.tsx` — mint and flush on foreground; drop the old hand-off**

Replace the effect at lines 65–70 (`const capture = () => …`) with:
```tsx
  // The share extension's credential and its offline queue: minted once, delivered on every foreground.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!unlocked) return;
    const sync = () => { void ensureShareToken().then(() => flushShareQueue(queryClient)).catch(() => undefined); };
    sync();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") sync(); });
    return () => sub.remove();
  }, [unlocked, queryClient]);
```
Imports: add `import { useQueryClient } from "@tanstack/react-query";` (keep the existing `QueryClient` import) and `import { ensureShareToken, flushShareQueue } from "../lib/share-save";`; remove `import { pendingShare } from "../lib/pending-share";`. Delete the `ResumeSharedLink` function (lines 96–110) and its `<ResumeSharedLink enabled={unlocked} />` render (line 92). Run `npx tsc --noEmit` — it names anything missed.

- [ ] **Step 5: `save.tsx` — the + screen only**

Remove: the `incoming` param and its `useEffect` (the block starting `if (incoming !== "1") return;`), `seenShare`, both `clearPendingShare()` calls, and the imports of `pendingShare`, `clearPendingShare`, `incomingLink`, `AppState`, `useLocalSearchParams`. The paste flow, `save()`, `close()` and the render are unchanged.

- [ ] **Step 6: Sign-out and deletion revoke the token**

`settings.tsx` line 105: replace `onPress: () => { void supabase.auth.signOut({ scope: "local" }).then(…` with:
```tsx
onPress: () => { void revokeShareToken().then(() => supabase.auth.signOut({ scope: "local" })).then(({ error }) => { if (error) Alert.alert("Could not sign out", "Please try again."); }); } },
```
and import `revokeShareToken` from `../../lib/share-save`.
`lib/account.ts`: before `await supabase.auth.signOut({ scope: "local" })…` add `clearCredential();` (import from `../modules/share-save`) — the server side cascades with the user row.

- [ ] **Step 7: STOP — list the five files to delete and get Pranav's yes; then delete**

```bash
git rm apps/mobile/lib/pending-share.ts apps/mobile/lib/incoming-share.ts apps/mobile/app/+native-intent.ts apps/mobile/test/pending-share.test.ts apps/mobile/test/incoming-share.test.ts
```

- [ ] **Step 8: Typecheck and tests**

Run (apps/mobile): `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass (two test files fewer, one more).

- [ ] **Step 9: Commit** — `git add -A apps/mobile && git commit -m "Share to Allkept saves on the spot; the old hand-off is gone"`

---

### Task 12: Compile and exercise on the simulator and emulator

**Files:** none (generated `ios/` and `android/` folders are prebuild output; do not commit them — confirm `.gitignore` covers `apps/mobile/ios` and `apps/mobile/android`, add if not).

- [ ] **Step 1: iOS**

Run (apps/mobile): `source ~/.nvm/nvm.sh && npx expo prebuild --platform ios --clean && npx expo run:ios`
Expected: the build includes target `AllkeptShare`; the app launches in the simulator. Fix compile errors in Swift here (the plan's Swift was written without a compiler; adjust minimally and keep both `SharedStore.swift` copies identical — re-run the guard).

- [ ] **Step 2: iOS share sheet**

In the simulator: Safari → any page → Share → "Allkept" appears → tap. Expected banner: "Open Allkept to sign in" (no session in the simulator), sheet closes after ~1.2 s. Screenshot it.

- [ ] **Step 3: Android**

Run: `npx expo prebuild --platform android --clean && npx expo run:android` (an emulator must be running). Chrome → Share → Allkept → expected toast "Open Allkept to sign in"; the app does not open.

- [ ] **Step 4: Stop the servers; do not commit prebuild output.**

---

### Task 13: Fingerprint, builds, device test

- [ ] **Step 1: Confirm the fingerprint moved (it must — native code changed) and record it**

Run (apps/mobile): `npx --yes @expo/fingerprint@latest fingerprint:generate . 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s.slice(s.indexOf("{"))).hash))'`

- [ ] **Step 2: STOP — Pranav confirms the two preview builds**

```bash
source ~/.nvm/nvm.sh && npx --yes eas-cli@latest build --profile preview --platform ios --non-interactive --no-wait
npx --yes eas-cli@latest build --profile preview --platform android --non-interactive --no-wait
```
Watch the iOS build log for "Syncing capabilities" — App Groups must sync without error (this sync misbehaved on 10 Sep, `cf1a387`).

- [ ] **Step 3: Device checklist for Pranav** (iOS via TestFlight from the preview build's submit, or an ad-hoc install; Android APK):
  1. Open Allkept once, signed in (mints the token).
  2. Instagram → Share → Allkept → "Saved to Allkept ✓" → open Allkept → the card is there.
  3. Airplane mode → share again → "Saved to Allkept. Syncs when you're online" → airplane off → open Allkept (iOS) or wait a minute (Android) → the card appears; no duplicate.
  4. Settings → Sign out → share → "Open Allkept to sign in".

---

### Task 14: Records

- [ ] `SESSION_LOG.md`: what shipped, fingerprints, build ids. `forlater.md`: item 18 → Done once the device checklist passes; add "iOS background delivery" as a queued follow-up if wanted. `docs/store-submission.html`: the review notes' "share a link from Safari" path now shows a banner instead of opening the app — update the sentence.

---

## Self-review against the spec

- Credential lifecycle (mint after sign-in, revoke on sign-out/deletion, re-mint on missing): Tasks 4, 7, 11. ✔
- Token stored hashed, rate-counted, RLS with no policies, SQL function locked to service role: Task 2 (+ DB test). ✔
- `save-link` token path and 429: Tasks 1, 3, 5. Gateway JWT off: Task 6. ✔
- Storage locations and queue format on both platforms: Tasks 8–10 (`SharedStore` ×2, `SharedStore.kt`). ✔
- Banner texts, exactly as approved, on both platforms: Task 9 Step 5, Task 10 Step 4. ✔
- Android background delivery: Task 9 Step 6. iOS flush on foreground: Task 7 + Task 11 Step 4. ✔
- Old hand-off removed: Task 11. ✔
- Verification ladder (Deno, vitest, DB test, simulator/emulator, EAS builds, device checklist): Tasks 2–7, 12, 13. ✔
- Names consistent: module `ShareSave` / `modules/share-save`; header `X-Share-Token` (`SHARE_TOKEN_HEADER = "x-share-token"`, headers are case-insensitive); function `share-token`; app group `group.app.allkept.mobile`; queue entry `{ text, requestId, at }` everywhere. ✔
