#!/usr/bin/env bash
# Runs all Edge Function tests. Integration tests run against the hosted project when supabase/.env.admin exists.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f supabase/.env.admin ]; then
  set -a; . supabase/.env.admin; set +a
else
  echo "supabase/.env.admin missing: integration tests will be skipped" >&2
fi
# --node-modules-dir=none: resolve npm: specifiers from Deno's own cache. Without it this fails on
# _shared/anthropic.ts, and the obvious escape (=auto) rewrites node_modules and breaks the next
# build's fingerprint. See ERRORS.md.
deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/
