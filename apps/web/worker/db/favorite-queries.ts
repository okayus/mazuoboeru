import { and, desc, eq } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { favorite } from "./schema";

// Add to favorites (idempotent — a second add is a no-op).
export async function addFavorite(env: Bindings, userId: string, quizId: string): Promise<void> {
  await db(env)
    .insert(favorite)
    .values({ userId, quizId, createdAt: Date.now() })
    .onConflictDoNothing();
}

export async function removeFavorite(env: Bindings, userId: string, quizId: string): Promise<void> {
  await db(env)
    .delete(favorite)
    .where(and(eq(favorite.userId, userId), eq(favorite.quizId, quizId)));
}

export async function isFavorited(env: Bindings, userId: string, quizId: string): Promise<boolean> {
  const rows = await db(env)
    .select({ quizId: favorite.quizId })
    .from(favorite)
    .where(and(eq(favorite.userId, userId), eq(favorite.quizId, quizId)))
    .limit(1);
  return rows.length > 0;
}

// Favorited quiz ids, most-recently-favorited first. The route filters these to
// currently-published quizzes via listPublishedQuizzes (stale favorites drop off).
export async function favoritedQuizIds(env: Bindings, userId: string): Promise<string[]> {
  const rows = await db(env)
    .select({ quizId: favorite.quizId })
    .from(favorite)
    .where(eq(favorite.userId, userId))
    .orderBy(desc(favorite.createdAt));
  return rows.map((r) => r.quizId);
}
