import { useEffect, useState } from "react";

// Minimal hash router (avoids a routing dependency). The worker serves the SPA for
// any path; hash routing keeps navigation purely client-side.
export type Route =
  | { name: "timeline" }
  | { name: "login" }
  | { name: "create" }
  | { name: "mine" }
  | { name: "challenge"; quizId: string }
  | { name: "settings" }
  | { name: "dashboard" };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/login") return { name: "login" };
  if (path === "/create") return { name: "create" };
  if (path === "/mine") return { name: "mine" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/dashboard") return { name: "dashboard" };
  const m = path.match(/^\/quiz\/(.+)$/);
  if (m && m[1]) return { name: "challenge", quizId: m[1] };
  return { name: "timeline" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
