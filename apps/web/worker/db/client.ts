import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../types";
import * as schema from "./schema";

// Build a typed Drizzle client over the D1 binding. Create one per request from
// the Hono context (`db(c.env)`); the D1Database binding is request-scoped.
export function db(env: Bindings) {
  return drizzle(env.DB, { schema });
}

export type DB = ReturnType<typeof db>;
