#!/usr/bin/env bash
# PreToolUse(Bash) hook — scoped via `if: "Bash(git commit *)"` in .claude/settings.json.
#
# WHY: An autonomous agent is probabilistic; "should have read the docs" is not a fix.
# This is an external gate at the durable point (commit = PR via the relay). When a
# commit changes a D1 migration, or writes a claim about prod migration/secret/binding
# state, it injects a system-reminder forcing a verify-against-prod check BEFORE the
# claim becomes canonical in a doc. It does NOT block — it only nudges (additionalContext).
# Origin: a stale "manual db:migrate:prod needed" doc claim was propagated as live prod
# state; Workers Builds actually auto-applies migrations on main merge. See the auto
# memories verify-prod-state-not-stale-docs / workers-builds-auto-applies-d1-migrations.
#
# Fail-open: any internal error exits 0 (never blocks a commit). Tune the keyword set
# below freely — it is inject-only, so over-firing is cheap and under-firing is the risk.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v jq >/dev/null 2>&1 || exit 0

files="$(git diff --cached --name-only 2>/dev/null)"
added="$(git diff --cached -U0 2>/dev/null | grep '^+' || true)"

ctx=""

# (a) A D1 migration is being added/changed.
if printf '%s' "$files" | grep -qiE 'drizzle/.*\.sql$|migrations/.*\.sql$'; then
  ctx="${ctx}• D1 migration changed: Workers Builds AUTO-APPLIES migrations on main merge (deploy command = \`wrangler d1 migrations apply --remote && wrangler deploy\`). Do NOT claim a manual \`pnpm db:migrate:prod\` is needed. Merging to main = applying to prod NOW — review the SQL for destructive ops (FK-off cascade; cloudflare-d1-drizzle-migration skill).
"
fi

# (b) The staged diff asserts prod migration/secret/binding state (added lines only).
if printf '%s' "$added" | grep -qiE 'db:migrate:prod|未適用|手で適用|人手.*(migrat|適用)|migration 待ち|table 不在|table 不存在|要 CF 認証|本番.*(secret|migration|binding).*(未|待ち|要)|wrangler secret put'; then
  ctx="${ctx}• Prod state asserted (migration/secret/binding): VERIFY before committing the claim. Credential-free check from the container: the \`Workers Builds: mazuoboeru\` check-run being success on the merged commit = migrate+deploy ran (curl the GitHub check-runs API). Docs lag; prod doesn't lie (CLAUDE.md). Don't propagate a stale 'manual step' claim.
"
fi

[ -z "$ctx" ] && exit 0

jq -n --arg c "⚠️ verify-prod-claims hook — re-examine before this commit becomes canonical:
${ctx}" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $c}}'
exit 0
