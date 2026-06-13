// Entity ids are random UUIDs (v4). crypto.randomUUID is available in Workers.
export function newId(): string {
  return crypto.randomUUID();
}
