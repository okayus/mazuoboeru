import type { LoadedQuiz } from "../db/quiz-queries";

// Challenge-facing projection of a quiz. NEVER includes is_correct or explanation:
// those are revealed per-answer only after the server grades a submission. This is a
// clean read-model split (the answer key belongs to the graded response, not the
// question), NOT a competitive anti-cheat boundary — there is no ranking (ADR-0010).
export type PublicQuizDTO = {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  publishedAt: number | null;
  tags: string[];
  questions: {
    id: string;
    type: "mcq_single" | "mcq_multi";
    prompt: string;
    position: number;
    choices: { id: string; text: string; position: number }[];
  }[];
};

export function publicQuizJson(
  loaded: LoadedQuiz,
  authorDisplayName: string,
  tags: string[] = [],
): PublicQuizDTO {
  return {
    id: loaded.quiz.id,
    title: loaded.quiz.title,
    description: loaded.quiz.description,
    authorDisplayName,
    publishedAt: loaded.quiz.publishedAt,
    tags,
    questions: loaded.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      position: q.position,
      choices: q.choices.map((ch) => ({
        id: ch.id,
        text: ch.text,
        position: ch.position,
      })),
    })),
  };
}
