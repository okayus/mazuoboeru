import {
  generateCodeVerifier,
  generateState,
  GitHub,
  Google,
  type OAuth2Tokens,
} from "arctic";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { oauthAccount, user, type User } from "../db/schema";
import { newId } from "../lib/id";
import type { Bindings, Env } from "../types";
import { createSession } from "./session";

type Provider = "google" | "github";

// Normalized identity from a provider, used by the find-or-create logic below.
type ProviderUser = {
  provider: Provider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
};

function isProvider(p: string): p is Provider {
  return p === "google" || p === "github";
}

function redirectURI(env: Bindings, provider: Provider): string {
  return `${env.ORIGIN}/auth/callback/${provider}`;
}

function googleClient(env: Bindings): Google | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectURI(env, "google"),
  );
}

function githubClient(env: Bindings): GitHub | null {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
  return new GitHub(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    redirectURI(env, "github"),
  );
}

// Short-lived (10 min) host-only cookies carrying the OAuth state / PKCE verifier
// across the provider round-trip. SameSite=Lax so they survive the top-level GET
// redirect back from the provider.
function setFlowCookie(c: Context<Env>, env: Bindings, name: string, value: string): void {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: env.ORIGIN.startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

// Google returns an OIDC id_token directly from the token endpoint over TLS; we
// read its claims (sub, email, email_verified, name) without re-verifying the
// signature, which is acceptable for tokens obtained directly from the endpoint.
async function googleUser(tokens: OAuth2Tokens): Promise<ProviderUser> {
  const claims = decodeJwtPayload(tokens.idToken());
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) throw new Error("google id_token missing sub");
  const email = typeof claims.email === "string" ? claims.email : null;
  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  const name =
    typeof claims.name === "string" && claims.name.trim().length > 0
      ? claims.name
      : email
        ? (email.split("@")[0] ?? "user")
        : "user";
  return { provider: "google", providerAccountId: sub, email, emailVerified, displayName: name };
}

async function githubUser(tokens: OAuth2Tokens): Promise<ProviderUser> {
  const headers = {
    Authorization: `Bearer ${tokens.accessToken()}`,
    "User-Agent": "mazuoboeru", // GitHub API rejects requests without a UA
    Accept: "application/vnd.github+json",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`github /user ${userRes.status}`);
  const gh = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
  };
  const id = typeof gh.id === "number" ? String(gh.id) : "";
  if (!id) throw new Error("github user missing id");
  const login = typeof gh.login === "string" ? gh.login : "user";
  const displayName =
    typeof gh.name === "string" && gh.name.trim().length > 0 ? gh.name : login;

  // The /user email can be private/null — use /user/emails and require verified.
  let email: string | null = null;
  let emailVerified = false;
  const emailRes = await fetch("https://api.github.com/user/emails", { headers });
  if (emailRes.ok) {
    const emails = (await emailRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const chosen =
      emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (chosen) {
      email = chosen.email;
      emailVerified = true;
    }
  }
  return { provider: "github", providerAccountId: id, email, emailVerified, displayName };
}

// Find-or-create with the ADR-0001 auto-link rule. The caller has already enforced
// that the email is present and verified by the current provider.
async function findOrCreateUser(env: Bindings, pu: ProviderUser): Promise<User> {
  const database = db(env);

  // 1. Known provider identity → that user.
  const linked = await database
    .select({ user })
    .from(oauthAccount)
    .innerJoin(user, eq(oauthAccount.userId, user.id))
    .where(
      and(
        eq(oauthAccount.provider, pu.provider),
        eq(oauthAccount.providerAccountId, pu.providerAccountId),
      ),
    )
    .limit(1);
  const linkedUser = linked[0]?.user;
  if (linkedUser) return linkedUser;

  // 2. First time with this provider: auto-link onto an existing verified-email
  //    account, or create a new user. (All stored emails were verified at creation.)
  const now = Date.now();
  const byEmail = pu.email
    ? await database.select().from(user).where(eq(user.email, pu.email)).limit(1)
    : [];
  let userId = byEmail[0]?.id;
  if (!userId) {
    userId = newId();
    await database.insert(user).values({
      id: userId,
      displayName: pu.displayName,
      email: pu.email,
      role: "user",
      status: "active",
      createdAt: now,
    });
  }
  await database.insert(oauthAccount).values({
    provider: pu.provider,
    providerAccountId: pu.providerAccountId,
    userId,
    createdAt: now,
  });

  const created = await database.select().from(user).where(eq(user.id, userId)).limit(1);
  const result = created[0];
  if (!result) throw new Error("user vanished after insert");
  return result;
}

function authError(c: Context<Env>, code: string): Response {
  return c.redirect(`/?auth_error=${code}`);
}

export const authRouter = new Hono<Env>();

// Begin login: redirect to the provider's authorization URL.
authRouter.get("/:provider", (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.notFound();

  const state = generateState();
  setFlowCookie(c, c.env, "oauth_state", state);

  if (provider === "google") {
    const client = googleClient(c.env);
    if (!client) return authError(c, "provider_unconfigured");
    const verifier = generateCodeVerifier();
    setFlowCookie(c, c.env, "oauth_verifier", verifier);
    const url = client.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
    return c.redirect(url.toString());
  }

  const client = githubClient(c.env);
  if (!client) return authError(c, "provider_unconfigured");
  const url = client.createAuthorizationURL(state, ["read:user", "user:email"]);
  return c.redirect(url.toString());
});

// OAuth callback: verify state, exchange code, enforce verified email, log in.
authRouter.get("/callback/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.notFound();

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, "oauth_state");
  const verifier = getCookie(c, "oauth_verifier");
  deleteCookie(c, "oauth_state", { path: "/" });
  deleteCookie(c, "oauth_verifier", { path: "/" });

  if (!code || !state || !storedState || state !== storedState) {
    return authError(c, "invalid_state");
  }

  let pu: ProviderUser;
  try {
    if (provider === "google") {
      const client = googleClient(c.env);
      if (!client) return authError(c, "provider_unconfigured");
      if (!verifier) return authError(c, "invalid_state");
      pu = await googleUser(await client.validateAuthorizationCode(code, verifier));
    } else {
      const client = githubClient(c.env);
      if (!client) return authError(c, "provider_unconfigured");
      pu = await githubUser(await client.validateAuthorizationCode(code));
    }
  } catch {
    return authError(c, "oauth_failed");
  }

  // ADR-0001: link/create only when the current provider asserts a verified email.
  if (!pu.email || !pu.emailVerified) return authError(c, "email_unverified");

  const u = await findOrCreateUser(c.env, pu);
  await createSession(c, u.id);
  return c.redirect("/");
});
