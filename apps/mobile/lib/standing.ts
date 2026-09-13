/**
 * Where a person stands, as a screen shows it — the pure half of billing.ts, kept free of native
 * imports so it can be tested. The server's my_entitlement() row comes in; a Standing goes out.
 */
/** "en-IN" → "IN"; "hi-Deva-IN" → "IN"; "en" → null. The fallback when the store cannot say. */
export function regionFromLocale(locale: string | undefined): string | null {
  if (!locale) return null;
  const m = /(?:^|[-_])([A-Z]{2})(?:$|[-_])/.exec(locale.replace(/_/g, "-").split("-").map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p)).join("-"));
  return m?.[1] ?? null;
}

/** What my_entitlement() returns. The server's answer, never the phone's guess. */
export interface EntitlementRow {
  entitled: boolean;
  storefront: string | null;
  saves_used: number;
  free_saves: number;
  status: string | null;
  will_renew: boolean | null;
  current_period_end: string | null;
  product_id: string | null;
}

export type Standing =
  /** A free region — or a phone that has not yet said where it buys from, which the server does not gate. */
  | { kind: "free_region" }
  | { kind: "subscribed"; renews: boolean; until: string | null; product: string | null }
  | { kind: "billing_issue"; until: string | null; product: string | null }
  | { kind: "ramp"; used: number; of: number; left: number }
  | { kind: "blocked"; lapsed: boolean };

/** The server's row, as a screen shows it. */
export function standing(row: EntitlementRow, now: Date): Standing {
  if (row.storefront === null || row.storefront === "IN") return { kind: "free_region" };
  const running = !!row.current_period_end && new Date(row.current_period_end) > now;
  if (row.status === "active" && running) return { kind: "subscribed", renews: row.will_renew !== false, until: row.current_period_end, product: row.product_id };
  if (row.status === "billing_issue" && running) return { kind: "billing_issue", until: row.current_period_end, product: row.product_id };
  if (row.saves_used < row.free_saves) return { kind: "ramp", used: row.saves_used, of: row.free_saves, left: row.free_saves - row.saves_used };
  if (row.entitled) return { kind: "subscribed", renews: row.will_renew !== false, until: row.current_period_end, product: row.product_id };
  return { kind: "blocked", lapsed: row.status !== null };
}

