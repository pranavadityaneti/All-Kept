// RevenueCat's news, verified and written down. All I/O injected; the rules are in _shared/billing.ts.
import { isOurUserId, rowsFor, verifySignature, type BillingEvent, type SubscriptionRow } from "../_shared/billing.ts";

export interface WebhookDeps {
  secret: string;
  now(): Date;
  /** Stores the event; false when this id was already stored, which is how a retry is answered without touching a row. */
  recordEvent(id: string, type: string, appUserId: string | null, payload: unknown): Promise<boolean>;
  userExists(userId: string): Promise<boolean>;
  upsertSubscription(row: SubscriptionRow): Promise<void>;
  /** A transfer moves every row of the old ids to the new owner. */
  transfer(from: string[], to: string): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain" } });

/**
 * Answers 200 for anything genuine, including things we choose to ignore: RevenueCat retries on
 * anything else, five times with growing delays, and a retry of an event we could not use gains
 * nothing. Answers 401 for anything not signed with our secret, and does not look at it.
 */
export async function handleBillingWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== "POST") return text("POST only", 405);
  const raw = await req.text();
  if (!(await verifySignature(req.headers.get("x-revenuecat-webhook-signature"), raw, deps.secret, deps.now()))) {
    return text("bad signature", 401);
  }

  let event: BillingEvent;
  try {
    const parsed = JSON.parse(raw) as { event?: BillingEvent };
    if (!parsed.event?.id || !parsed.event.type) return text("no event", 400);
    event = parsed.event;
  } catch { return text("not json", 400); }

  // Once. A retry of an event already stored is answered here and changes nothing.
  const fresh = await deps.recordEvent(event.id, event.type, event.app_user_id ?? null, event);
  if (!fresh) return text("already handled", 200);

  if (event.type === "TRANSFER") {
    const to = (event.transferred_to ?? []).find(isOurUserId);
    const from = (event.transferred_from ?? []).filter(isOurUserId);
    if (to && from.length) await deps.transfer(from, to);
    else deps.log("billing: transfer with no usable ids", { id: event.id });
    return text("ok", 200);
  }

  // Recorded, and nothing else to do: a TEST, an experiment, a currency transaction. Answered
  // before asking who the person is — RevenueCat wants its 200 quickly, and a lookup for an event
  // that writes nothing is a round trip for nothing.
  const rows = rowsFor(event, deps.now());
  if (rows.length === 0) return text("ignored", 200);

  if (!isOurUserId(event.app_user_id) || !(await deps.userExists(event.app_user_id))) {
    // Recorded above for anyone investigating; not an error to RevenueCat, which would only retry.
    deps.log("billing: event for a user we do not know", { id: event.id, type: event.type });
    return text("unknown user", 200);
  }

  for (const row of rows) await deps.upsertSubscription(row);
  return text("ok", 200);
}
