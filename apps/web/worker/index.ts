import { Hono } from "hono";
import { runScheduled } from "./cron";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.json({ status: "ok" }));

// L3 of the 3-layer SPA routing dance: delegate unmatched routes to the Assets binding.
app.notFound(async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
} satisfies ExportedHandler<Bindings>;
