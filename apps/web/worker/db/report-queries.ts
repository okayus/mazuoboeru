import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { ReportReasonCategory, ReportTargetType } from "../domain/report";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { question, quiz, report, user } from "./schema";

// Count a reporter's reports created strictly after `since` (epoch ms) — the input to
// the rolling-window rate limit. Backed by idx_report_reporter(reporter_id, created_at).
export async function countReportsSince(
  env: Bindings,
  reporterId: string,
  since: number,
): Promise<number> {
  const rows = await db(env)
    .select({ n: count() })
    .from(report)
    .where(and(eq(report.reporterId, reporterId), gt(report.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

// Has this reporter already reported this exact target? Reporting is idempotent per
// (reporter, target): a double-click neither duplicates the moderator's queue nor
// burns the daily quota.
export async function hasReported(
  env: Bindings,
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const rows = await db(env)
    .select({ id: report.id })
    .from(report)
    .where(
      and(
        eq(report.reporterId, reporterId),
        eq(report.targetType, targetType),
        eq(report.targetId, targetId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Does the report target actually exist? Guards against reports against arbitrary ids.
// quiz: must not be soft-deleted (a draft/hidden quiz is still reportable by id, but a
// deleted one is gone). question / user: plain existence.
export async function reportTargetExists(
  env: Bindings,
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const d = db(env);
  if (targetType === "quiz") {
    const rows = await d
      .select({ id: quiz.id })
      .from(quiz)
      .where(and(eq(quiz.id, targetId), isNull(quiz.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }
  if (targetType === "question") {
    const rows = await d
      .select({ id: question.id })
      .from(question)
      .where(eq(question.id, targetId))
      .limit(1);
    return rows.length > 0;
  }
  const rows = await d
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, targetId))
    .limit(1);
  return rows.length > 0;
}

export type NewReport = {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReasonCategory;
  reasonText: string | null;
};

export async function createReport(env: Bindings, input: NewReport): Promise<string> {
  const id = newId();
  await db(env).insert(report).values({
    id,
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reasonCategory: input.reasonCategory,
    reasonText: input.reasonText,
    status: "open",
    createdAt: Date.now(),
  });
  return id;
}
