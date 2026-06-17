import type { LoadedQuiz } from "../db/quiz-queries";

// Challenge-facing projection of a quiz. NEVER includes is_correct or explanation:
// the correct answer and explanation are revealed per-answer only after the server
// grades a submission (anti-cheat — grading is server-authoritative). See
// docs/security.md.
export function publicQuizJson(
  loaded: LoadedQuiz,
  authorDisplayName: string,
  tags: string[] = [],
) {
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
