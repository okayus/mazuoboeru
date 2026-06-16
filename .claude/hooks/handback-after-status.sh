#!/usr/bin/env bash
# PostToolUse(Read) hook — fires after a file is read; acts ONLY when it was
# docs/project-status.md. Injects a HANDBACK reminder so that, for a planning /
# feature / phase task, Claude presents current state + candidate directions and
# RETURNS TO THE USER before grilling / planning / editing — instead of
# autonomously chaining status→plan→implement, which leaves no seam for
# grill-with-docs or user steering.
#
# WHY a nudge (additionalContext), not a hard stop: the only true hard stop is
# `{"continue": false}`, but it ends the turn BEFORE Claude can present its reading
# + options (the user would see only a canned string) and would also break a plain
# "read status & explain" request. A timed injection right at the status→plan
# boundary is far stronger than a passive CLAUDE.md rule, while keeping the rich
# "here's the state + options, your call" handback the user actually wants. See the
# auto memory pause-after-status-before-planning. Pairs with the CLAUDE.md 着手フロー
# rule and the grill UserPromptSubmit nudge (suggest-grill-on-planning.sh).
#
# Inject-only + fail-open: never blocks; any error exits 0. Fires on every read of
# project-status.md; the message itself tells Claude to just answer for a pure
# status question, so over-firing is cheap.

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
fp="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"

[ "$tool" = "Read" ] || exit 0
case "$fp" in
  */docs/project-status.md) ;;
  *) exit 0 ;;
esac

jq -n '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: "📍 ハンドバック地点（着手フロー）: project-status.md を読了。これが新機能/フェーズ/計画タスクなら、ここで【現在地の要約 ＋ 候補方針 2-3（各トレードオフを一言）】を提示して一旦ユーザーに返し、方針の指示を待て。この turn で grill-with-docs・詳細計画・コード編集に進まない（status 読了＝着手許可ではない）。方針が決まってから grill→計画→実装の順。純粋な status 質問・運用操作（merge/status 更新等）なら通常どおり回答してよい＝最終判断はあなた。"}}'
exit 0
