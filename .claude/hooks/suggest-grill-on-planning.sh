#!/usr/bin/env bash
# UserPromptSubmit hook — nudges Claude to run the grill-with-docs skill BEFORE
# finalizing an implementation plan, so plans get stress-tested against the domain
# model / CONTEXT.md / ADRs WITHOUT the user having to type /grill-with-docs.
#
# WHY this shape: Claude Code hooks CANNOT invoke a skill directly (documented
# limitation), and there is no config to force-auto-invoke a skill (skills are
# model-invoked by description = non-deterministic). The reliable, idiomatic pattern
# is to DETERMINISTICALLY inject a reminder at prompt time when planning intent is
# detected; Claude then invokes the skill. Same inject-only philosophy as
# verify-prod-claims.sh (a nudge, never a block).
#
# Fail-open + inject-only: never blocks the prompt; any error exits 0. Over-firing is
# cheap (one reminder line) and under-firing is the real risk, so the keyword set is
# intentionally generous. The reminder defers the final call to Claude ("skip for
# trivial changes / questions / ops"), so a stray match costs ~nothing. Tune freely.

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)"
[ -z "$prompt" ] && exit 0

# Planning / design / phase-transition intent (JP + EN, case-insensitive). Routine
# ops (merge / commit / "status 更新" / fix typo) lack these words and won't fire.
# English short words use \b so "plan" doesn't match "explanation", etc.
if ! printf '%s' "$prompt" | grep -qiE '実装計画|実装方針|計画|設計|進め方|着手|フェーズ|次のフェーズ|フェーズ移行|ロードマップ|新機能|機能追加|機能を追加|どう作|どう実装|どのように実装|アーキテクチャ|構成案|グリル|grill|\bplan\b|\bplanning\b|\bdesign\b|architect|roadmap|\bphase\b|new feature|\bapproach\b|best way|how (should|do|can|would) (we|i|you)'; then
  exit 0
fi

jq -n '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "⚠️ grill-on-planning フック: 実装計画の兆候を検出。これが新機能/フェーズの実装計画なら、プランを確定（ExitPlanMode / 実装着手）する前に grill-with-docs スキルを起動し、(1) 既存ドメインモデル・データモデルとの整合 (2) CONTEXT.md の用語 (3) docs/adr の決定 と突き合わせること。判明した用語は CONTEXT.md、後戻りしにくい決定は docs/adr に落とす。些末な変更・単なる質問・運用操作（merge/status 更新等）なら起動不要＝最終判断はあなたが行う。"}}'
exit 0
