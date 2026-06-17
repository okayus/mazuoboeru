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
  tags: string[];
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
  tags: string[];
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
  favorited: boolean;
  questionStats: Record<string, { correct: number; total: number }>;
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
  tags: string[];
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
  tags?: string[];
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

export type ReportTargetType = "quiz" | "question" | "user";
export type ReportReason = "spam" | "sexual" | "violence" | "copyright" | "other";
export type ReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReason;
  reasonText?: string;
};

export type TagAccuracy = { name: string; correct: number; total: number };
export type Dashboard = {
  overall: { correct: number; total: number };
  streak: { current: number; longest: number };
  tags: TagAccuracy[];
  untagged: { correct: number; total: number };
  quizzesAttempted: number;
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

  timeline: (tag?: string) =>
    request<{ quizzes: TimelineItem[]; related?: { broader: string[]; narrower: string[] } }>(
      `/public/quizzes${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
    ),
  publicQuiz: (id: string) => request<{ quiz: PublicQuiz }>(`/public/quizzes/${id}`),

  myQuizzes: () => request<{ quizzes: AuthorQuizSummary[] }>("/quizzes/mine"),
  createQuiz: (input: QuizInput) =>
    request<{ id: string }>("/quizzes", { method: "POST", body: JSON.stringify(input) }),
  publishQuiz: (id: string) =>
    request<{ ok: true; status: string }>(`/quizzes/${id}/publish`, { method: "POST" }),
  deleteQuiz: (id: string) =>
    request<{ ok: true }>(`/quizzes/${id}`, { method: "DELETE" }),
  setQuizTags: (id: string, tags: string[]) =>
    request<{ ok: true; tags: string[] }>(`/quizzes/${id}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    }),

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

  report: (input: ReportInput) =>
    request<{ ok: true; duplicate?: boolean }>("/reports", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  dashboard: () => request<Dashboard>("/dashboard"),

  favorites: () => request<{ quizzes: TimelineItem[] }>("/favorites"),
  addFavorite: (quizId: string) =>
    request<{ ok: true; favorited: boolean }>(`/favorites/${quizId}`, { method: "POST" }),
  removeFavorite: (quizId: string) =>
    request<{ ok: true; favorited: boolean }>(`/favorites/${quizId}`, { method: "DELETE" }),
};
