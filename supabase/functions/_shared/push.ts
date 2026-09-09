// Telling someone their save has landed.
//
// Expo's push service fronts both APNs and FCM, so one call reaches an iPhone and an Android phone
// alike and neither certificate has to be handled here. Pure but for the fetch and the database
// reader, both injected, so the decisions below can be tested without sending anything to anyone.

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
/** Expo's own cap per request. A person with more devices than this is not a case worth paging for. */
const BATCH = 100;
const TIMEOUT_MS = 8_000;

export type PushReason = "sorted" | "attention";

export interface PushDeps {
  fetch: typeof fetch;
  /** The person's switches, or null when there is no profile row to read. */
  preferences(userId: string): Promise<{ enabled: boolean; sorted: boolean; attention: boolean } | null>;
  /** Live tokens for the person: ones already known to be dead are not returned. */
  tokens(userId: string): Promise<{ token: string; platform: string }[]>;
  /** Records that Expo has refused a token, so it is not tried again every time. */
  markDead(token: string, reason: string): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

export interface PushOutcome {
  sent: number;
  /** Why nothing was sent, when nothing was. Never an error: a notification is not worth failing a save over. */
  skipped?: "disabled" | "muted" | "no-devices" | "no-profile";
}

/** Whether this person wants this particular kind of news. The master switch wins over both. */
export function wants(
  prefs: { enabled: boolean; sorted: boolean; attention: boolean } | null,
  reason: PushReason,
): { ok: boolean; skipped?: PushOutcome["skipped"] } {
  if (!prefs) return { ok: false, skipped: "no-profile" };
  if (!prefs.enabled) return { ok: false, skipped: "disabled" };
  if (reason === "sorted" && !prefs.sorted) return { ok: false, skipped: "muted" };
  if (reason === "attention" && !prefs.attention) return { ok: false, skipped: "muted" };
  return { ok: true };
}

/**
 * A token Expo has refused for good, as opposed to one that failed this once.
 *
 * DeviceNotRegistered means the app was deleted or the permission withdrawn — that token will never
 * work again and retrying it forever is how a send that should take a moment starts timing out.
 * Every other error is treated as this-time-only and the token is left alone.
 */
export const isDeadToken = (error: string | undefined): boolean => error === "DeviceNotRegistered";

async function post(f: typeof fetch, body: unknown): Promise<Record<string, unknown>[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(EXPO_PUSH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`expo push answered ${res.status}`);
    const json = await res.json() as { data?: Record<string, unknown>[] };
    return json.data ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends one piece of news to every device a person has.
 *
 * Never throws. A notification is the least important thing happening in the pipeline — a save that
 * arrived correctly must not be marked failed because a push service was slow.
 */
export async function notify(
  userId: string,
  reason: PushReason,
  message: { title: string; body: string; itemId: string },
  deps: PushDeps,
): Promise<PushOutcome> {
  try {
    const permission = wants(await deps.preferences(userId), reason);
    if (!permission.ok) return { sent: 0, ...(permission.skipped ? { skipped: permission.skipped } : {}) };

    const devices = await deps.tokens(userId);
    if (devices.length === 0) return { sent: 0, skipped: "no-devices" };

    let sent = 0;
    for (let i = 0; i < devices.length; i += BATCH) {
      const slice = devices.slice(i, i + BATCH);
      const tickets = await post(deps.fetch, slice.map((d) => ({
        to: d.token,
        title: message.title,
        body: message.body,
        // What the app opens when the notification is tapped. Without it a tap lands on the home
        // screen and the person has to go and find the thing they were just told about.
        data: { itemId: message.itemId, reason },
        channelId: "saves",
      })));

      for (let t = 0; t < slice.length; t++) {
        const ticket = tickets[t];
        const status = ticket?.["status"];
        if (status === "ok") { sent++; continue; }
        const detail = (ticket?.["details"] as { error?: string } | undefined)?.error;
        if (isDeadToken(detail)) await deps.markDead(slice[t]!.token, detail!);
        else deps.log("push: ticket rejected", { user: userId, reason, error: detail ?? "unknown" });
      }
    }
    return { sent };
  } catch (e) {
    deps.log("push: send failed", { user: userId, reason, detail: e instanceof Error ? e.message : String(e) });
    return { sent: 0 };
  }
}

/** What the notification actually says. Short: a lock screen shows about one line of each. */
export function compose(reason: PushReason, item: { title: string | null; category: string | null }): { title: string; body: string } {
  const name = item.title?.trim() || "Your save";
  if (reason === "attention") {
    return { title: "A save needs you", body: `${name} arrived without something we could show.` };
  }
  return item.category
    ? { title: "Saved", body: `${name} is in ${item.category}.` }
    : { title: "Saved", body: `${name} is in your library.` };
}
