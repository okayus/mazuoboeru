// Typed client for the worker API. Same-origin fetch sends the session cookie and
// the Origin header automatically (the latter satisfies the CSRF check). Errors are
// thrown as plain objects (no classes — project rule).
//
// Response DTOs are inferred from the worker's handlers via Hono RPC (hc<AppType> +
// InferResponseType), so the client and server can't drift (ADR-0011). We keep the
// ergonomic `api.*` facade + the `request<T>` fetch wrapper (views are unchanged);
// `client` exists only to carry the types (`typeof client...`), it's never called.
// Request bodies (QuizInput etc.) stay hand-written — routes validate via zod, not a
// Hono validator, so RPC can't infer the input shapes.
import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "../worker";
import type { ApiErrorBody, ApiErrorCode } from "../worker/http/errors";

const client = hc<AppType>("/");

// Success body of an endpoint: every error response is `{ error: ApiErrorCode, ... }`,
// so excluding that envelope leaves only the 2xx shape (no per-status filtering needed).
type Ok<T> = Exclude<InferResponseType<T>, ApiErrorBody>;

// ---- Response DTOs, derived from the server (single source of truth) ----
export type Me = NonNullable<Ok<typeof client.api.auth.me.$get>["user"]>;

export type TimelineItem = Ok<typeof client.api.public.quizzes.$get>["quizzes"][number];

export type PublicQuiz = Ok<(typeof client.api.public.quizzes)[":id"]["$get"]>["quiz"];
export type PublicQuestion = PublicQuiz["questions"][number];
export type PublicChoice = PublicQuestion["choices"][number];

export type AttemptState = Ok<typeof client.api.attempts.$post>;
export type AnswerDetail = AttemptState["answers"][number];
export type AnswerResult = Ok<(typeof client.api.attempts)[":attemptId"]["answers"]["$post"]>;

export type AuthorQuizSummary = Ok<typeof client.api.quizzes.mine.$get>["quizzes"][number];

export type TokenSummary = Ok<typeof client.api.tokens.$get>["tokens"][number];
export type CreatedToken = Ok<typeof client.api.tokens.$post>["token"];

export type Dashboard = Ok<typeof client.api.dashboard.$get>;
export type TagAccuracy = Dashboard["tags"][number];

export type ReviewListItem = Ok<(typeof client.api)["review-list"]["$get"]>["items"][number];

// ---- Request inputs (hand-written; these are what the client SENDS) ----
export type QuestionType = "mcq_single" | "mcq_multi";
export type ChoiceInput = { text: string; isCorrect: boolean };
export type QuestionInput = {
  type: QuestionType;
  prompt: string;
  explanation?: string;
  choices: ChoiceInput[];
};
export type QuizInput = {
  title: string;
  description?: string;
  questions: QuestionInput[];
  tags?: string[];
};

export type ReportTargetType = "quiz" | "question" | "user";
export type ReportReason = "spam" | "sexual" | "violence" | "copyright" | "other";
export type ReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReason;
  reasonText?: string;
};

// ---- Error handling ----
export type ApiError = { isApiError: true; status: number; body: ApiErrorBody | null };

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "isApiError" in e;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err: ApiError = { isApiError: true, status: res.status, body: body as ApiErrorBody | null };
    throw err;
  }
  return body as T;
}

export const api = {
  me: () => request<Ok<typeof client.api.auth.me.$get>>("/auth/me"),
  logout: () => request<Ok<typeof client.api.auth.logout.$post>>("/auth/logout", { method: "POST" }),

  timeline: (tag?: string) =>
    request<Ok<typeof client.api.public.quizzes.$get>>(
      `/public/quizzes${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
    ),
  publicQuiz: (id: string) =>
    request<Ok<(typeof client.api.public.quizzes)[":id"]["$get"]>>(`/public/quizzes/${id}`),

  myQuizzes: () => request<Ok<typeof client.api.quizzes.mine.$get>>("/quizzes/mine"),
  createQuiz: (input: QuizInput) =>
    request<Ok<typeof client.api.quizzes.$post>>("/quizzes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  publishQuiz: (id: string) =>
    request<Ok<(typeof client.api.quizzes)[":id"]["publish"]["$post"]>>(`/quizzes/${id}/publish`, {
      method: "POST",
    }),
  deleteQuiz: (id: string) =>
    request<Ok<(typeof client.api.quizzes)[":id"]["$delete"]>>(`/quizzes/${id}`, {
      method: "DELETE",
    }),
  setQuizTags: (id: string, tags: string[]) =>
    request<Ok<(typeof client.api.quizzes)[":id"]["tags"]["$put"]>>(`/quizzes/${id}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    }),

  startAttempt: (quizId: string) =>
    request<Ok<typeof client.api.attempts.$post>>("/attempts", {
      method: "POST",
      body: JSON.stringify({ quizId }),
    }),
  submitAnswer: (attemptId: string, questionId: string, choiceIds: string[]) =>
    request<Ok<(typeof client.api.attempts)[":attemptId"]["answers"]["$post"]>>(
      `/attempts/${attemptId}/answers`,
      { method: "POST", body: JSON.stringify({ questionId, choiceIds }) },
    ),

  listTokens: () => request<Ok<typeof client.api.tokens.$get>>("/tokens"),
  createToken: (name: string) =>
    request<Ok<typeof client.api.tokens.$post>>("/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeToken: (id: string) =>
    request<Ok<(typeof client.api.tokens)[":id"]["$delete"]>>(`/tokens/${id}`, { method: "DELETE" }),

  report: (input: ReportInput) =>
    request<Ok<typeof client.api.reports.$post>>("/reports", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  dashboard: () => request<Ok<typeof client.api.dashboard.$get>>("/dashboard"),

  reviewList: () => request<Ok<(typeof client.api)["review-list"]["$get"]>>("/review-list"),
  addToReviewList: (questionId: string) =>
    request<Ok<(typeof client.api)["review-list"][":questionId"]["$post"]>>(
      `/review-list/${questionId}`,
      { method: "POST" },
    ),
  removeFromReviewList: (questionId: string) =>
    request<Ok<(typeof client.api)["review-list"][":questionId"]["$delete"]>>(
      `/review-list/${questionId}`,
      { method: "DELETE" },
    ),
};
