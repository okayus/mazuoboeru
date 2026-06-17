import { Hono } from "hono";
import { z } from "zod";
import {
  requireAuth,
  requireCreator,
  requireScope,
  requireUser,
} from "../auth/middleware";
import {
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
import { listQuizTags, setQuizTags, tagsForQuizzes } from "../db/tag-queries";
import { parseTags } from "../domain/tag";
import { validateForPublish } from "../domain/quiz-validation";
import type { Env } from "../types";

const choiceInput = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
});
const questionInput = z.object({
  type: z.enum(["mcq_single", "mcq_multi"]),
  prompt: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(4000).optional(),
  choices: z.array(choiceInput).max(20),
});
// Draft-permissive (CONTEXT.md: a draft may be incomplete). The publish gate, not
// this schema, enforces gradeability. `tags` is loose here (raw strings); the
// domain parseTags() does the real normalization / dedup / capping.
const contentSchema = z.object({
  title: z.string().trim().max(200),
  description: z.string().trim().max(4000).optional(),
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
    })),
  };
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
      choices: q.choices.map((ch) => ({
        id: ch.id,
        text: ch.text,
        isCorrect: ch.isCorrect,
        position: ch.position,
      })),
    })),
  };
}

export const quizzesRouter = new Hono<Env>();

// Create a draft. Works for both web (session) and AI/CLI (PAT with quiz:write).
quizzesRouter.post("/", requireAuth, requireScope("quiz:write"), requireCreator, async (c) => {
  const user = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = contentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const id = await createDraftQuiz(c.env, user.id, toContentInput(parsed.data));
  if (parsed.data.tags?.length) {
    await setQuizTags(c.env, id, parseTags(parsed.data.tags));
  }
  return c.json({ id }, 201);
});

// List the caller's own quizzes (any status), with their tags. Must precede GET /:id.
quizzesRouter.get("/mine", requireAuth, async (c) => {
  const user = requireUser(c);
  const quizzes = await listQuizzesByAuthor(c.env, user.id);
  const tagsByQuiz = await tagsForQuizzes(c.env, quizzes.map((q) => q.id));
  return c.json({
    quizzes: quizzes.map((q) => ({ ...q, tags: tagsByQuiz.get(q.id) ?? [] })),
  });
});

// Author edit view of a single quiz.
quizzesRouter.get("/:id", requireAuth, async (c) => {
  const user = requireUser(c);
  const loaded = await loadQuizWithContent(c.env, c.req.param("id"));
  if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  const tags = await listQuizTags(c.env, loaded.quiz.id);
  return c.json({ quiz: authorQuizJson(loaded, tags) });
});

// Edit. Drafts: full content replace. Published/hidden: title/description only
// (ADR-0002 — restructuring a published quiz is rejected in MVP).
quizzesRouter.patch("/:id", requireAuth, requireScope("quiz:write"), async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const loaded = await loadQuizWithContent(c.env, id);
  if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  const body = (await c.req.json().catch(() => null)) as unknown;

  if (loaded.quiz.status === "draft") {
    const parsed = contentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    await replaceDraftContent(c.env, id, toContentInput(parsed.data));
    return c.json({ ok: true });
  }

  if (body && typeof body === "object" && "questions" in body) {
    return c.json({ error: "cannot_restructure_published" }, 409);
  }
  const parsed = metaSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  await updateQuizMeta(c.env, id, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
  });
  return c.json({ ok: true });
});

// The publish gate: irreversible draft -> published, server-enforced gradeability.
quizzesRouter.post("/:id/publish", requireAuth, requireScope("quiz:write"), requireCreator, async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const loaded = await loadQuizWithContent(c.env, id);
  if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  if (loaded.quiz.status !== "draft") {
    return c.json({ error: "not_draft" }, 409);
  }
  const errors = validateForPublish({
    title: loaded.quiz.title,
    questions: loaded.questions.map((q) => ({
      type: q.type,
      choices: q.choices.map((ch) => ({ isCorrect: ch.isCorrect })),
    })),
  });
  if (errors.length > 0) {
    return c.json({ error: "not_publishable", errors }, 422);
  }
  await publishQuiz(c.env, id);
  return c.json({ ok: true, status: "published" });
});

// Set/replace a quiz's tags. Author-only, any non-deleted status (tags are a minor
// metadata edit — ADR-0002 — so this is allowed post-publish, unlike restructuring).
quizzesRouter.put("/:id/tags", requireAuth, requireScope("quiz:write"), async (c) => {
  const user = requireUser(c);
  const id = c.req.param("id");
  const loaded = await loadQuizWithContent(c.env, id);
  if (!loaded || loaded.quiz.deletedAt !== null || loaded.quiz.authorId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = tagsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  await setQuizTags(c.env, id, parseTags(parsed.data.tags));
  return c.json({ ok: true, tags: await listQuizTags(c.env, id) });
});

// Soft delete (ADR-0002). Author only.
quizzesRouter.delete("/:id", requireAuth, async (c) => {
  const user = requireUser(c);
  const ok = await softDeleteQuiz(c.env, user.id, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
