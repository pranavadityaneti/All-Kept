// The sweeper's second job: process one item right now, on behalf of a door that captured it
// somewhere else in the world (see _shared/enqueue.ts). The cron's body is `{}`, which is not a request for one item.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function singleItemRequest(body: unknown): { itemId: string; retry: boolean } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const itemId = typeof b["itemId"] === "string" ? b["itemId"] : "";
  if (!UUID.test(itemId)) return null;
  return { itemId, retry: b["retry"] === true };
}
