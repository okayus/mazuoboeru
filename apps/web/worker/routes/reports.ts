import { Hono } from "hono";
import { z } from "zod";
import { requireSession, requireUser } from "../auth/middleware";
import {
  countReportsSince,
  createReport,
  hasReported,
  reportTargetExists,
} from "../db/report-queries";
import {
  isReportRateLimited,
  REPORT_REASON_CATEGORIES,
  REPORT_REASON_MAX,
  REPORT_TARGET_TYPES,
  REPORT_WINDOW_MS,
} from "../domain/report";
import { apiError } from "../http/errors";
import type { Env } from "../types";

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().trim().min(1).max(100),
  reasonCategory: z.enum(REPORT_REASON_CATEGORIES),
  reasonText: z.string().trim().max(REPORT_REASON_MAX).optional(),
});

// Moderation report channel (Phase 1 MVP). Session-only: reporting is a human
// moderation signal, not an automatable action — there is no `report` PAT scope, so
// AI/CLI agents (quiz:read/quiz:write only) can't file reports. Per-user throttle
// (10 / rolling 24h) and idempotent per (reporter, target). Triage is manual via
// wrangler in MVP; Discord notify is Phase 2, admin UI Phase 4 (data-model.md).
export const reportsRouter = new Hono<Env>()
  .use("*", requireSession)

  .post("/", async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
    }
    const { targetType, targetId, reasonCategory, reasonText } = parsed.data;

    // You can't report yourself.
    if (targetType === "user" && targetId === user.id) {
      return c.json(apiError("cannot_report_self"), 400);
    }

    // Target must exist — no reports against arbitrary ids.
    if (!(await reportTargetExists(c.env, targetType, targetId))) {
      return c.json(apiError("target_not_found"), 404);
    }

    // Idempotent: a repeat report of the same target by the same user is a no-op (it
    // doesn't duplicate the moderator's queue or consume the quota). Checked before the
    // rate limit so a sincere re-click never trips the limiter.
    if (await hasReported(c.env, user.id, targetType, targetId)) {
      return c.json({ ok: true, duplicate: true });
    }

    // Per-user rolling-window rate limit (data-model.md).
    const recent = await countReportsSince(c.env, user.id, Date.now() - REPORT_WINDOW_MS);
    if (isReportRateLimited(recent)) {
      return c.json(apiError("rate_limited"), 429);
    }

    await createReport(c.env, {
      reporterId: user.id,
      targetType,
      targetId,
      reasonCategory,
      reasonText: reasonText && reasonText.length > 0 ? reasonText : null,
    });
    return c.json({ ok: true, duplicate: false }, 201);
  });
