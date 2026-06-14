#!/usr/bin/env bash
#
# Inject mazuoboeru PRODUCTION Worker Secrets via wrangler.
#
# ┌─ RUN ON THE HOST, NOT INSIDE THE DEV SANDBOX ────────────────────────────┐
# │ Production secret VALUES must never enter the container (ADR-0003,         │
# │ "secret-zero"). The sandbox also has no authenticated wrangler. Run this   │
# │ on the host where `pnpm exec wrangler` is logged in (the same auth you     │
# │ already use for `pnpm db:migrate:prod`).                                   │
# └───────────────────────────────────────────────────────────────────────────┘
#
# Usage:
#   1. cp .prod-secrets.example .prod-secrets   # gitignored; fill REAL values
#   2. bash scripts/put-prod-secrets.sh         # (or: pnpm secrets:prod)
#
# MVP is GitHub-only (ADR-0001): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and
# PAT_PEPPER are REQUIRED; the GOOGLE_* pair is OPTIONAL (set both only if/when
# you add Google back). Values are read from apps/web/.prod-secrets if present,
# otherwise from the environment. Nothing is written until all required are set.
#
# Auth (pick one, on the host):
#   - pnpm exec wrangler login          # interactive browser OAuth, or
#   - export CLOUDFLARE_API_TOKEN=...   # token with "Workers Scripts: Edit"
#
set -euo pipefail

cd "$(dirname "$0")/.."   # -> apps/web (where wrangler.jsonc lives)

# Load .prod-secrets if present (gitignored). Values may also come from the env.
if [ -f .prod-secrets ]; then
  set -a; . ./.prod-secrets; set +a
fi

REQUIRED=(GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET PAT_PEPPER)
OPTIONAL=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET)   # Google deferred (ADR-0001)

# Fail fast if any REQUIRED are missing — never half-configure production.
missing=()
for n in "${REQUIRED[@]}"; do
  [ -n "${!n:-}" ] || missing+=("$n")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "ERROR: missing required values: ${missing[*]}" >&2
  echo "Fill apps/web/.prod-secrets (see .prod-secrets.example) or export them, then re-run." >&2
  exit 1
fi

# Include the Google pair only if BOTH are set (the worker needs both, or neither).
to_put=("${REQUIRED[@]}")
google_set=0
for n in "${OPTIONAL[@]}"; do
  [ -n "${!n:-}" ] && google_set=$((google_set + 1))
done
if [ "$google_set" -eq 2 ]; then
  to_put+=("${OPTIONAL[@]}")
elif [ "$google_set" -eq 1 ]; then
  echo "WARN: only one of ${OPTIONAL[*]} is set — skipping Google (needs both)." >&2
fi

for n in "${to_put[@]}"; do
  echo "Putting secret: $n"
  # printf %s (no trailing newline) piped to wrangler's non-TTY stdin reader.
  printf '%s' "${!n}" | pnpm exec wrangler secret put "$n"
done

echo
echo "Done. Verify GitHub login is configured in production:"
echo "  curl -sI https://mazuoboeru.shiraoka.workers.dev/auth/github | grep -i location"
echo "  # expect: Location: https://github.com/login/oauth/authorize/...  (not /?auth_error=provider_unconfigured)"
