export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  RP_ID: string;
  ORIGIN: string;
  // Add more bindings (secrets, KV, etc.) as needed. Every other worker file imports from here — don't re-declare the type.
};
