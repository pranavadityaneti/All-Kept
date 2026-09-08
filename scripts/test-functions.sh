#!/usr/bin/env bash
# Runs all Edge Function tests. Integration tests run against the hosted project when supabase/.env.admin exists.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f supabase/.env.admin ]; then
  set -a; . supabase/.env.admin; set +a
else
  echo "supabase/.env.admin missing: integration tests will be skipped" >&2
fi
deno test --allow-env --allow-net --allow-read supabase/functions/tests/
