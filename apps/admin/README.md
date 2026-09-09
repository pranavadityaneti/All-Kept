# Allkept Admin

A separate web app for the team. It shares the existing Supabase backend with the mobile app; no mobile screens or ingestion paths are changed.

## Local preview

Use Node 22.12+ (tested with Node 26). From the repository root:

```sh
npm ci
VITE_ADMIN_DEMO=true npm run dev --workspace @allkept/admin
```

Open http://127.0.0.1:5174. The demo has fictional data and cannot send retries. Without a Supabase configuration, the sign-in screen also offers an explicit **Explore demo** option. Failed live requests never fall back to sample data.

For live development, copy `apps/admin/.env.example` to `apps/admin/.env.local`, set the Supabase project URL and **public anon or publishable key**, and leave `VITE_ADMIN_DEMO=false`. Never put a service role key in a `VITE_` variable; those values are included in the browser bundle.

## What is included

- **Overview:** registered users (excluding anonymous accounts), total stored items, accounts with tracked app events, saves per UTC day, saves by platform, and current failed/stale sorting counts. New saves count distinct library items, not repeated saves of an existing item. Deleted items no longer contribute. Active accounts may include guests.
- **Users:** search name, email or user ID; 25 rows per page; profile completion, save count, join date and last sign-in. The profile dialog shows name, gender, optional phone and connection count. Last sign-in is an Auth timestamp, not a claim of current online activity. No private photos, full saved content, or raw webhook payloads are fetched.
- **Processing:** unfinished preview/classification work; failure and 10-minute stale filters; bounded error details and separate attempt counts. Operators can queue an eligible retry. Active classification leases and recently queued items cannot be retried.
- **Sources & imports:** current connected source status and last seen/polled timestamps; import ingestion counts and unfinished/failed save counts. An export finishing ingestion does not mean its items finished sorting.
- **Activity:** app events and audited admin retries, newest first. Search and date range filters; no raw event payloads or search terms.

Viewer accounts can read the dashboard. Operator accounts can also queue retries. All pages are responsive, use keyboard-accessible controls and modal dialogs, and respect reduced motion. Lists have search and pagination; Overview and Activity have 7/30/90-day ranges. Data refresh is explicit.

## Backend setup and deployment

The implementation has not deployed or changed a hosted project. Apply these steps in your normal release process:

1. Apply the existing migrations and `20260909152819_admin_dashboard.sql`. It creates `admin_members`, `admin_audit_log`, and two service-only RPCs. The admin list starts empty. The migration explicitly grants the server role read access to only five Auth user columns needed by the invoker RPC: ID, email, anonymous flag, creation time and last sign-in time.
2. Set the Edge Function secret `ADMIN_ALLOWED_ORIGINS` to a comma-separated list of exact web origins, without trailing slashes. Example: `https://admin.your-domain.com,http://127.0.0.1:5174`. Wildcards are not supported. No browser origin is allowed when this setting is absent.
3. Deploy the `admin-dashboard` Edge Function. Its `verify_jwt=false` setting is intentional: the handler verifies each bearer with Supabase `auth.getUser()` and the SQL RPC checks the resulting user's current admin membership on every request. Do not remove either check. Service-role credentials remain in the Edge Function environment.
4. Enable Google in Supabase Auth (already used by mobile). Add the web callback `https://admin.your-domain.com/auth/callback` to the Auth redirect allowlist, plus `http://127.0.0.1:5174/auth/callback` for local development. Keep mobile redirects intact. The web client uses PKCE.
5. Have each approved team member sign in once so their Auth user exists. They will see access denied until explicitly enrolled. Find their verified user ID in Supabase Auth, then run this reviewed SQL in your administrative database session:

   ```sql
   insert into public.admin_members(user_id, role)
   values ('REPLACE_WITH_APPROVED_AUTH_USER_UUID', 'operator')
   on conflict (user_id) do update set role=excluded.role, enabled=true;
   ```

   Use `viewer` for read-only access. To revoke access, set `enabled=false` for that UUID. Email domains, self-editable profile data and JWT user metadata do not grant access. There is intentionally no browser-based admin enrollment page.

6. Build with the production web environment: `npm run build --workspace @allkept/admin`. Serve `apps/admin/dist` on your static host over HTTPS, with an SPA fallback to `index.html` for `/auth/callback`. Set `VITE_ADMIN_DEMO=false`. The app does not deploy itself.
7. Set hosting headers: `Cache-Control: no-store` for `index.html`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: frame-ancestors 'none'`. Cache hashed assets immutably. If enforcing a full CSP, permit the project's Supabase HTTPS/WSS endpoints, Google Fonts styles/fonts, the app's inline chart styles, and same-origin scripts. Do not cache admin API responses; the handler already returns `Cache-Control: no-store`.
8. Confirm the existing sweeper schedule and classifier configuration are healthy. A retry updates the durable item queue and writes its audit entry in the same database transaction. The sweeper normally runs every five minutes, with additional delay under load. A queued confirmation does not mean processing has succeeded.

Retry requests carry an idempotency UUID. Re-submission of the same request is safe, concurrent active classification is protected, and each item has a one-minute retry cooldown. The dialog keeps the same UUID when retrying a request after a network failure. No bulk retry or automatic paid processing loop is added.

## Verification

```sh
npm run typecheck --workspace @allkept/admin
npm run test --workspace @allkept/admin
npm run build --workspace @allkept/admin
deno test --no-lock --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/admin-dashboard/handler_test.ts
deno check --no-lock --node-modules-dir=none supabase/functions/admin-dashboard/index.ts
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_dashboard.sql
```

Use only a disposable database with the repository migrations applied for SQL tests. Fixtures roll back. These tests exercise real database roles, blocked membership/metadata escalation, viewer/operator separation, all read branches, active lease protection, retry idempotency and atomic audit rollback. HTTP tests cover CORS, missing/invalid sessions, input limits, verified actor identity and safe error responses.

Before production rollout, verify Google sign-in and callback handling on the actual web domain with an approved operator, viewer and unapproved account. Test a retry against a disposable save with a running worker. These require project credentials and an enrolled admin; local SQL tests and demo interaction checks do not validate hosted OAuth or external processing providers.

## Boundaries for this first version

No user deletion, impersonation, content editing, arbitrary SQL, admin enrollment, billing controls or bulk mutations. Metrics are computed on demand from operational tables; high-volume reporting should move to aggregate tables as traffic grows. There is no live provider uptime probe or background refresh. A source marked active is its stored connection status, not a guarantee that its provider is reachable now.
