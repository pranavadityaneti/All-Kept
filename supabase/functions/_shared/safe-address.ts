/**
 * Only public addresses are fetched on a person's behalf.
 *
 * A save's link is something the person typed, and the pipeline fetches it to learn the title, the
 * picture and where a shortener leads. Left unchecked, that is a way to make our servers fetch any
 * address they can reach — a cloud metadata service, a private database, another service on the
 * same network — and to read part of the answer back through the title the save ends up with. The
 * 13 September security audit proved the path from the client's items grant to the fetch (B1, A4).
 *
 * Three doors, all closed here: an address that is private on its face (an IP literal, localhost),
 * a public-looking hostname that resolves to a private address, and a redirect from a public page
 * to a private one. The check runs on every hop, after DNS, and fails closed when DNS says nothing.
 */

export type Resolver = (hostname: string) => Promise<string[]>;

const MAX_HOPS = 5;

/** Hostnames that name the machine or the network we are on, whatever DNS would say. */
const BLOCKED_HOSTS = ["localhost", "metadata.google.internal", "instance-data", "metadata"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".intranet", ".lan"];

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return BLOCKED_HOSTS.includes(h) || BLOCKED_SUFFIXES.some((s) => h.endsWith(s));
}

const parseV4 = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
};

/** IPv4 ranges that are not the public internet: private, loopback, link-local, carrier NAT, reserved, documentation, multicast. */
function isPrivateV4(o: number[]): boolean {
  const [a, b] = o as [number, number, number, number];
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (o[2] === 0 || o[2] === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && o[2] === 100)
    || (a === 203 && b === 0 && o[2] === 113)
    || a >= 224;
}

/** Eight 16-bit groups, or null when it is not an IPv6 address. Handles :: and an embedded IPv4 tail. */
function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%"); if (zone >= 0) s = s.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(":")) return null;
  // An IPv4 tail becomes two groups.
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (tail) {
    const v4 = parseV4(tail[1]!); if (!v4) return null;
    s = s.slice(0, -tail[1]!.length) + ((v4[0]! << 8) | v4[1]!).toString(16) + ":" + ((v4[2]! << 8) | v4[3]!).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + rest.length > 7) return null;
  const groups = [...head, ...Array(8 - head.length - rest.length).fill("0"), ...rest];
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

function isPrivateV6(g: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  if (g.every((x) => x === 0)) return true;                                 // :: unspecified
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true; // ::1
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {                          // ::ffff:a.b.c.d
    return isPrivateV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]);
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {                        // 64:ff9b::a.b.c.d (NAT64)
    return isPrivateV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]);
  }
  if (g0 === 0x2002) return isPrivateV4([g1 >> 8, g1 & 255, g2 >> 8, g2 & 255]);                            // 6to4 carries an IPv4
  if ((g0 & 0xfe00) === 0xfc00) return true;                                                                 // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true;                                                                 // fe80::/10 link local
  if ((g0 & 0xff00) === 0xff00) return true;                                                                 // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true;                                                           // documentation
  return false;
}

/** True for any address that is not the public internet. Unparseable counts as private: fail closed. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) return isPrivateV4(v4);
  const v6 = parseV6(ip);
  if (v6) return isPrivateV6(v6);
  return true;
}

/** DNS as Deno answers it, both families, ignoring a family that has no record. */
export const denoResolve: Resolver = async (hostname) => {
  const out: string[] = [];
  for (const kind of ["A", "AAAA"] as const) {
    try { out.push(...(await Deno.resolveDns(hostname, kind))); } catch { /* no record of this kind */ }
  }
  return out;
};

/**
 * Throws unless the address is http(s) to a public host that resolves only to public addresses.
 * The URL parser has already normalised the tricks — decimal and octal IPs, mixed case, a trailing
 * dot — so what reaches here is the address that would actually be dialled.
 */
export async function assertPublicUrl(url: string, resolve: Resolver): Promise<void> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("blocked: not a url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`blocked: ${u.protocol.replace(":", "")} scheme`);
  if (u.username || u.password) throw new Error("blocked: credentials in url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || isBlockedHost(host)) throw new Error("blocked: local host");
  if (parseV4(host) || parseV6(host)) {
    if (isPrivateAddress(host)) throw new Error("blocked: private address");
    return;
  }
  const addresses = await resolve(host);
  if (addresses.length === 0) throw new Error("blocked: unresolvable host");
  if (addresses.some(isPrivateAddress)) throw new Error("blocked: resolves to a private address");
}

/**
 * A fetch that only ever dials public addresses, on every hop.
 *
 * Redirects are followed here rather than by the platform, so each Location is checked before it
 * is dialled; a caller that asked for `redirect: "manual"` gets the 3xx back and does its own
 * following — through this same fetch, so its next hop is checked too. A Request object is reduced
 * to its address: nothing in this codebase passes one.
 */
export function safeFetch(base: typeof fetch, resolve: Resolver = denoResolve): typeof fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    let url = input instanceof Request ? input.url : String(input);
    const manual = init.redirect === "manual";
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      await assertPublicUrl(url, resolve);
      const res = await base(url, { ...init, redirect: "manual" });
      if (manual || res.status < 300 || res.status >= 400) return res;
      const location = res.headers.get("location");
      if (!location) return res;
      await res.body?.cancel().catch(() => undefined);
      url = new URL(location, url).toString();
    }
    throw new Error("too many redirects");
  }) as typeof fetch;
}
