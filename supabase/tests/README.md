# Database regressions

These SQL scripts use transactions and assertions and roll back their fixtures. Run them only against a disposable/local Supabase database with the repository migrations applied, using its Postgres owner connection. They exercise real RLS roles and database functions; they are not pgTAP scripts.

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/classification_retries.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/library_search.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/import_progress.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profile_onboarding.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_dashboard.sql
```

The test database must be otherwise empty because the sweeper assertions check the entire work queue. Never point these checks at a user's hosted library. See `docs/engineering/sorting-and-search.md` for rollout order and the checks performed during implementation.
