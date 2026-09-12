// The launch waitlist, called by the sign-up pills on allkept.app. No sign-in: the caller is
// anyone on the internet, so the defences are the honeypot field, the shape check, and a per-network
// cap — never trust in the anon key, which is public by design.
import type { WaitlistResponse, WaitlistSource } from "../_shared/contracts.ts";

export interface WaitlistDeps {
  /** Origins allowed to call from a browser. Requests with no Origin (curl, server) pass. */
  origins: string[];
  /** Salted, day-scoped hash of the network address; null when no address is known. */
  hashIp(ip: string): Promise<string>;
  /** Sign-ups from this hash inside the rolling hour. */
  recentFromIp(ipHash: string): Promise<number>;
  /** Stores the row; "already" when the address is on the list. */
  insert(row: { email: string; source: WaitlistSource; ip_hash: string | null; user_agent: string | null }): Promise<"joined" | "already">;
}

export const MAX_PER_IP_PER_HOUR = 5;
const SOURCES: ReadonlySet<string> = new Set(["site-hero", "site-footer"]);
// Same shape rule the site used before: something@something.tld, no whitespace.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = {
  joined: "You’re in. We’ll let you know first.",
  already: "You’re already on the list.",
  invalid: "Enter a valid email address.",
  rateLimited: "Too many sign-ups from this network. Try again in an hour.",
  failed: "Something went wrong. Try again.",
} as const;

/** The caller's network address as the edge sees it, or null. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("cf-connecting-ip")?.trim() || null;
}

export function createHandler(deps: WaitlistDeps) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const allowed = !origin || deps.origins.includes(origin);
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    const reply = (status: number, body: WaitlistResponse | { error: string; code: string }) =>
      new Response(JSON.stringify(body), { status, headers });

    if (!allowed) return reply(403, { error: "This origin is not allowed.", code: "unauthorized" });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply(405, { error: "Use POST.", code: "bad_request" });

    let body: Record<string, unknown> | null = null;
    try {
      const v: unknown = await req.json();
      if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
    } catch { /* not JSON */ }
    if (!body) return reply(400, { error: MESSAGES.invalid, code: "bad_request" });

    // Honeypot: a real person never sees this field. A filled one gets a cheerful nothing.
    const website = body["website"];
    if (typeof website === "string" && website.trim()) return reply(200, { joined: true, message: MESSAGES.joined });

    const raw = body["email"];
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !EMAIL.test(email)) return reply(400, { error: MESSAGES.invalid, code: "bad_request" });

    const src = body["source"];
    const source: WaitlistSource = typeof src === "string" && SOURCES.has(src) ? (src as WaitlistSource) : "site";

    try {
      const ip = clientIp(req);
      const ipHash = ip ? await deps.hashIp(ip) : null;
      if (ipHash && (await deps.recentFromIp(ipHash)) >= MAX_PER_IP_PER_HOUR) {
        return reply(429, { error: MESSAGES.rateLimited, code: "rate_limited" });
      }
      const ua = req.headers.get("user-agent");
      const outcome = await deps.insert({ email, source, ip_hash: ipHash, user_agent: ua ? ua.slice(0, 256) : null });
      return outcome === "joined"
        ? reply(200, { joined: true, message: MESSAGES.joined })
        : reply(200, { joined: false, message: MESSAGES.already });
    } catch (e) {
      console.error("waitlist failed", e);
      return reply(500, { error: MESSAGES.failed, code: "internal" });
    }
  };
}
