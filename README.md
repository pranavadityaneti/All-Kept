# Allkept

Monorepo for Allkept, the saved-posts app. See `docs/` in the Random Tasks folder for the proposal and Phase 0 spec.

- `packages/normalize` – URL → platform/kind/canonical URL (pure TS, shared with Edge Functions via `npm run sync:shared`)
- `packages/contracts` – request/response types
- `supabase/` – migrations and Edge Functions (Deno)

Commands: `npm run typecheck`, `npm test`, `npm run test:functions`, `supabase start`, `supabase db reset`.
