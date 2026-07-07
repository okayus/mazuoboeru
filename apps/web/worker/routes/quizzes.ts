import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireCreator, requireScope, requireUser } from "../auth/middleware";
import {
  applyPublishedEdit,
  createDraftQuiz,
  listQuizzesByAuthor,
  loadQuizWithContent,
  type LoadedQuiz,
  publishQuiz,
  type QuizContentInput,
  replaceDraftContent,
  softDeleteQuiz,
  updateQuizMeta,
} from "../db/quiz-queries";
import {
  type EditQuestionInput,
  type ExistingQuestion,
  planPublishedEdit,
} from "../domain/quiz-edit";
import { listQuizTags, setQuizTags, tagsForQuizzes } from "../db/tag-queries";
import { validateForPublish } from "../domain/quiz-validation";
import { MAX_ACCEPTED_ANSWERS, MAX_ANSWER_LEN } from "../domain/short-answer";
import { parseTags } from "../domain/tag";
import { apiError } from "../http/errors";
import type { Env } from "../types";

const choiceInput = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
});
// Draft-permissive (a draft may be incomplete). `choices` allows empty for `short`; `answer`
// holds the short-answer Accepted Answers (ADR-0012). The publish gate enforces gradeability.
// `id` marks an existing question when editing a published quiz (diff-apply, ADR-0014);
// ignored for creates and draft replaces. explanation/description accept null so the author
// GET output round-trips straight back into a PATCH (get -> edit -> update, CLI flow).
const questionInput = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["mcq_single", "mcq_multi", "short"]),
  prompt: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(4000).nullish(),
  choices: z.array(choiceInput).max(20),
  answer: z
    .array(z.string().trim().min(1).max(MAX_ANSWER_LEN))
    .max(MAX_ACCEPTED_ANSWERS)
    .optional(),
});
// Draft-permissive (CONTEXT.md: a draft may be incomplete). The publish gate, not
// this schema, enforces gradeability. `tags` is loose here (raw strings); the
// domain parseTags() does the real normalization / dedup / capping.
const contentSchema = z.object({
  title: z.string().trim().max(200),
  description: z.string().trim().max(4000).nullish(),
  questions: z.array(questionInput).max(100),
  tags: z.array(z.string()).max(50).optional(),
});
const metaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
});
// Tags are quiz-level metadata — settable on any non-deleted quiz the author owns
// (a minor edit per ADR-0002), so this lives apart from the content/meta PATCH.
const tagsSchema = z.object({
  tags: z.array(z.string()).max(50),
});

type ContentData = z.infer<typeof contentSchema>;

function toContentInput(data: ContentData): QuizContentInput {
  return {
    title: data.title,
    description: data.description ?? null,
    questions: data.questions.map((q) => ({
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation ?? null,
      choices: q.choices.map((ch) => ({ text: ch.text, isCorrect: ch.isCorrect })),
      answer: q.answer ?? [],
    })),
  };
}

// The same payload questions, with ids kept, as diff-apply input (ADR-0014).
function toEditQuestions(data: ContentData): EditQuestionInput[] {
  return data.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation ?? null,
    answer: q.answer ?? [],
    choices: q.choices.map((ch) => ({ text: ch.text, isCorrect: ch.isCorrect })),
  }));
}

// The quiz's current active questions in the planner's shape (loadQuizWithContent
// already filters to active — retired ids are "unknown" to the planner by design).
function toExistingQuestions(loaded: LoadedQuiz): ExistingQuestion[] {
  return loaded.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation,
    answer: q.answer,
    choices: q.choices.map((ch) => ({ text: ch.text, isCorrect: ch.isCorrect })),
    position: q.position,
  }));
}

// Author view: full fidelity including is_correct + explanation (it's the editor).
function authorQuizJson(loaded: LoadedQuiz, tags: string[] = []) {
  return {
    id: loaded.quiz.id,
    title: loaded.quiz.title,
    description: loaded.quiz.description,
    status: loaded.quiz.status,
    createdAt: loaded.quiz.createdAt,
    updatedAt: loaded.quiz.updatedAt,
    publishedAt: loaded.quiz.publishedAt,
    tags,
    questions: loaded.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation,
      position: q.position,
      // Author editor = full fidelity: the accepted answers ARE shown to the author (short).
      answer: q.answer,
      choices: q.choices.map((ch) => ({
        id: ch.id,
        text: ch.text,
        isCorrect: ch.isCorrect,
        position: ch.position,
      })),
    })),
  };
}

export const quizzesRouter = new Hono<Env>()
  // Create a draft. Works for both web (session) and AI/CLI (PAT with quiz:write).
  .post("/", requireAuth, requireScope("quiz:write"), requireCreator, async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = contentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
    }
    const id = await createDraftQuiz(c.env, user.id, toContentInput(parsed.data));
    if (parsed.data.tags?.length) {
      await setQuizTags(c.env, id, parseTags(parsed.data.tags));
    }
    return c.json({ id }, 201);
  })

  // List the caller's own quizzes (any status), with their tags. Must precede GET /:id.
  .get("/mine", requireAuth, async (c) => {
    const user = requireUser(c);
    const quizzes = await listQuizzesByAuthor(c.env, user.id);
    const tagsByQuiz = await tagsForQuizzes(
      c.env,
      quizzes.map((q) => q.id),
    );
    return c.json({
      quizzes: quizzes.map((q) => ({ ...q, tags: tagsByQuiz.get(q.id) ?? [] })),
    });
  })

  // Author edit view of a single quiz.
  .get("/:id", requireAuth, async (c) => {
    const user = requireUser(c);
    const loaded = await loadQuizWithContent(c.env, c.req.param("id"));
    if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
      return c.json(apiError("not_found"), 404);
    }
    const tags = await listQuizTags(c.env, loaded.quiz.id);
    return c.json({ quiz: authorQuizJson(loaded, tags) });
  })

  // Edit. Drafts: full content replace (destructive — draft questions are never
  // referenced by answer/review_list, payload ids are ignored). Published/hidden:
  // without `questions` = title/description only (unchanged minor edit); with
  // `questions` = full-document diff-apply (ADR-0014) — id-preserving updates, id-less
  // inserts, omitted ids retire, unknown/duplicate ids and type changes are rejected.
  // The edit gate re-runs validateForPublish on the resulting active set (a published
  // quiz must stay gradeable — ADR-0002 2026-07-06 追記); semantic major edits (correct
  // answer changes etc.) are accepted and history is never regraded. hidden is treated
  // like published so an author can fix reported content (the quiz stays hidden).
  .patch("/:id", requireAuth, requireScope("quiz:write"), async (c) => {
    const user = requireUser(c);
    const id = c.req.param("id");
    const loaded = await loadQuizWithContent(c.env, id);
    if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
      return c.json(apiError("not_found"), 404);
    }
    const body = (await c.req.json().catch(() => null)) as unknown;

    if (loaded.quiz.status === "draft") {
      const parsed = contentSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
      }
      await replaceDraftContent(c.env, id, toContentInput(parsed.data));
      return c.json({ ok: true });
    }

    if (!(body && typeof body === "object" && "questions" in body)) {
      const parsed = metaSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
      }
      await updateQuizMeta(c.env, id, {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
      });
      return c.json({ ok: true });
    }

    const parsed = contentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
    }
    const planned = planPublishedEdit(toExistingQuestions(loaded), toEditQuestions(parsed.data));
    if (!planned.ok) {
      // A typo'd id must fail loudly, never silently retire + re-insert (ADR-0014).
      if (planned.problems.some((p) => p.kind === "type_change")) {
        return c.json(apiError("question_type_immutable", { problems: planned.problems }), 409);
      }
      if (planned.problems.some((p) => p.kind === "unknown_question_id")) {
        return c.json(apiError("unknown_question_id", { problems: planned.problems }), 400);
      }
      return c.json(apiError("duplicate_question_id", { problems: planned.problems }), 400);
    }
    const gateErrors = validateForPublish({
      title: parsed.data.title,
      questions: parsed.data.questions.map((q) => ({
        type: q.type,
        choices: q.choices.map((ch) => ({ isCorrect: ch.isCorrect })),
        acceptedAnswers: q.answer ?? [],
      })),
    });
    if (gateErrors.length > 0) {
      return c.json(apiError("not_gradeable", { errors: gateErrors }), 422);
    }
    await applyPublishedEdit(
      c.env,
      id,
      { title: parsed.data.title, description: parsed.data.description ?? null },
      planned.plan,
    );
    // The applied diff, so a CLI/agent can check intent against effect (ADR-0014).
    return c.json({
      ok: true,
      updated: planned.plan.updates.length,
      added: planned.plan.inserts.length,
      retired: planned.plan.retireIds.length,
      unchanged: planned.plan.unchangedIds.length,
    });
  })

  // The publish gate: irreversible draft -> published, server-enforced gradeability.
  .post("/:id/publish", requireAuth, requireScope("quiz:write"), requireCreator, async (c) => {
    const user = requireUser(c);
    const id = c.req.param("id");
    const loaded = await loadQuizWithContent(c.env, id);
    if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
      return c.json(apiError("not_found"), 404);
    }
    if (loaded.quiz.status !== "draft") {
      return c.json(apiError("not_draft"), 409);
    }
    const errors = validateForPublish({
      title: loaded.quiz.title,
      questions: loaded.questions.map((q) => ({
        type: q.type,
        choices: q.choices.map((ch) => ({ isCorrect: ch.isCorrect })),
        acceptedAnswers: q.answer,
      })),
    });
    if (errors.length > 0) {
      return c.json(apiError("not_publishable", { errors }), 422);
    }
    await publishQuiz(c.env, id);
    return c.json({ ok: true, status: "published" });
  })

  // Set/replace a quiz's tags. Author-only, any non-deleted status (tags are a minor
  // metadata edit — ADR-0002 — so this is allowed post-publish, unlike restructuring).
  .put("/:id/tags", requireAuth, requireScope("quiz:write"), async (c) => {
    const user = requireUser(c);
    const id = c.req.param("id");
    const loaded = await loadQuizWithContent(c.env, id);
    if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
      return c.json(apiError("not_found"), 404);
    }
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = tagsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(apiError("invalid_body", { issues: parsed.error.issues }), 400);
    }
    await setQuizTags(c.env, id, parseTags(parsed.data.tags));
    return c.json({ ok: true, tags: await listQuizTags(c.env, id) });
  })

  // Soft delete (ADR-0002). Author only.
  .delete("/:id", requireAuth, async (c) => {
    const user = requireUser(c);
    const ok = await softDeleteQuiz(c.env, user.id, c.req.param("id"));
    if (!ok) return c.json(apiError("not_found"), 404);
    return c.json({ ok: true });
  });
