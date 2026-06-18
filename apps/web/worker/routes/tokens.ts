import { Hono } from "hono";
import { z } from "zod";
import { requireSession, requireUser } from "../auth/middleware";
import { createToken, listTokens, revokeToken } from "../auth/pat";
import { apiError } from "../http/errors";
import type { Env } from "../types";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

// PAT management. Session-only (a PAT must not be able to mint or revoke PATs).
export const tokensRouter = new Hono<Env>()
  .use("*", requireSession)

  .get("/", async (c) => {
    const user = requireUser(c);
    const tokens = await listTokens(c.env, user.id);
    return c.json({ tokens });
  })

  .post("/", async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return c.json(apiError("invalid_body"), 400);
    // The raw token is returned here exactly once and never again.
    const token = await createToken(c.env, user.id, parsed.data.name);
    return c.json({ token }, 201);
  })

  .delete("/:id", async (c) => {
    const user = requireUser(c);
    const ok = await revokeToken(c.env, user.id, c.req.param("id"));
    if (!ok) return c.json(apiError("not_found"), 404);
    return c.json({ ok: true });
  });
