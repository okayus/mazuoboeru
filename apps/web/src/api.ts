// Typed client for the worker API. Same-origin fetch sends the session cookie and
// the Origin header automatically (the latter satisfies the CSRF check). Errors
// are thrown as plain objects (no classes — project rule).

export type Me = { id: string; displayName: string; role: string };

export type TimelineItem = {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  publishedAt: number | null;
  questionCount: number;
};

export type PublicChoice = { id: string; text: string; position: number };
export type QuestionType = "mcq_single" | "mcq_multi";
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  position: number;
  choices: PublicChoice[];
};
export type PublicQuiz = {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  publishedAt: number | null;
  questions: PublicQuestion[];
};

export type AnswerDetail = {
  questionId: string;
  selectedChoiceIds: string[];
  isCorrect: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
};
export type AttemptState = {
  attempt: { id: string; finished: boolean; score: number | null; total: number | null; startedAt: number };
  quiz: PublicQuiz;
  answers: AnswerDetail[];
};
export type AnswerResult = {
  isCorrect: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
  finished: boolean;
  score: number | null;
  total: number | null;
};

export type AuthorQuizSummary = {
  id: string;
  title: string;
  status: "draft" | "published" | "hidden";
  createdAt: number;
  publishedAt: number | null;
};

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
};

export type TokenSummary = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
};
export type CreatedToken = {
  id: string;
  name: string;
  token: string;
  scopes: string[];
  createdAt: number;
};

export type ApiError = { isApiError: true; status: number; body: unknown };

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
    const err: ApiError = { isApiError: true, status: res.status, body };
    throw err;
  }
  return body as T;
}

export const api = {
  me: () => request<{ user: Me | null }>("/auth/me"),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  timeline: () => request<{ quizzes: TimelineItem[] }>("/public/quizzes"),
  publicQuiz: (id: string) => request<{ quiz: PublicQuiz }>(`/public/quizzes/${id}`),

  myQuizzes: () => request<{ quizzes: AuthorQuizSummary[] }>("/quizzes/mine"),
  createQuiz: (input: QuizInput) =>
    request<{ id: string }>("/quizzes", { method: "POST", body: JSON.stringify(input) }),
  publishQuiz: (id: string) =>
    request<{ ok: true; status: string }>(`/quizzes/${id}/publish`, { method: "POST" }),
  deleteQuiz: (id: string) =>
    request<{ ok: true }>(`/quizzes/${id}`, { method: "DELETE" }),

  startAttempt: (quizId: string) =>
    request<AttemptState>("/attempts", { method: "POST", body: JSON.stringify({ quizId }) }),
  submitAnswer: (attemptId: string, questionId: string, choiceIds: string[]) =>
    request<AnswerResult>(`/attempts/${attemptId}/answers`, {
      method: "POST",
      body: JSON.stringify({ questionId, choiceIds }),
    }),

  listTokens: () => request<{ tokens: TokenSummary[] }>("/tokens"),
  createToken: (name: string) =>
    request<{ token: CreatedToken }>("/tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => request<{ ok: true }>(`/tokens/${id}`, { method: "DELETE" }),
};
