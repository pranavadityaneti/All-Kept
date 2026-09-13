import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { assertPublicUrl, isBlockedHost, isPrivateAddress, safeFetch, type Resolver } from "../_shared/safe-address.ts";

const publicDns: Resolver = async () => ["93.184.216.34"];
const privateDns: Resolver = async (h) => (h === "evil.example" ? ["10.0.0.5"] : ["93.184.216.34"]);
const noDns: Resolver = async () => [];

Deno.test("every private, loopback, link-local, carrier and reserved IPv4 range is private", () => {
  for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "127.255.255.255", "169.254.169.254", "0.0.0.0", "100.64.0.1", "100.127.255.255", "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "255.255.255.255"]) {
    assert(isPrivateAddress(ip), ip);
  }
});

Deno.test("public IPv4 is public", () => {
  for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "100.128.0.1", "1.1.1.1"]) assertEquals(isPrivateAddress(ip), false, ip);
});

Deno.test("IPv6: loopback, unspecified, unique-local, link-local, multicast, and the ranges that hide an IPv4 inside", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:c0a8:101::", "2001:db8::1", "[::1]"]) {
    assert(isPrivateAddress(ip), ip);
  }
  assertEquals(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946"), false);
  assertEquals(isPrivateAddress("::ffff:93.184.216.34"), false);
});

Deno.test("something that is not an address at all counts as private, so a parser gap fails closed", () => {
  assert(isPrivateAddress("not-an-ip"));
  assert(isPrivateAddress("1.2.3"));
  assert(isPrivateAddress("999.1.1.1"));
});

Deno.test("hosts that name the machine or the network are blocked whatever DNS would say", () => {
  for (const h of ["localhost", "LOCALHOST", "foo.localhost", "printer.local", "db.internal", "metadata.google.internal", "box.home.arpa", "localhost."]) assert(isBlockedHost(h), h);
  assertEquals(isBlockedHost("example.com"), false);
  assertEquals(isBlockedHost("local.example.com"), false);
});

Deno.test("a URL is refused for a private literal, a private resolution, an unknown host, a bad scheme, or embedded credentials", async () => {
  await assertRejects(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/", publicDns), Error, "private address");
  await assertRejects(() => assertPublicUrl("http://[::1]:8080/", publicDns), Error, "private address");
  await assertRejects(() => assertPublicUrl("http://evil.example/", privateDns), Error, "resolves to a private");
  await assertRejects(() => assertPublicUrl("http://nowhere.example/", noDns), Error, "unresolvable");
  await assertRejects(() => assertPublicUrl("file:///etc/passwd", publicDns), Error, "scheme");
  await assertRejects(() => assertPublicUrl("gopher://example.com/", publicDns), Error, "scheme");
  await assertRejects(() => assertPublicUrl("http://user:pw@example.com/", publicDns), Error, "credentials");
  await assertPublicUrl("https://example.com/page", publicDns);
});

Deno.test("the URL parser's normalisation is what is checked: a decimal IP and an octal IP are still 127.0.0.1", async () => {
  await assertRejects(() => assertPublicUrl("http://2130706433/", publicDns), Error, "private address");
  await assertRejects(() => assertPublicUrl("http://0177.0.0.1/", publicDns), Error, "private address");
  await assertRejects(() => assertPublicUrl("http://127.1/", publicDns), Error, "private address");
});

const routes = (table: Record<string, () => Response>): typeof fetch => (async (input: string | URL | Request) => {
  const url = String(input);
  for (const [prefix, make] of Object.entries(table)) if (url.startsWith(prefix)) return make();
  return new Response("nope", { status: 404 });
}) as typeof fetch;

Deno.test("a public page that redirects to a private address is stopped at the hop, never dialled", async () => {
  let dialled: string[] = [];
  const base: typeof fetch = (async (input: string | URL | Request) => {
    const url = String(input); dialled.push(url);
    if (url === "https://example.com/go") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/" } });
    return new Response("secret", { status: 200 });
  }) as typeof fetch;
  const f = safeFetch(base, publicDns);
  await assertRejects(() => f("https://example.com/go"), Error, "private address");
  assertEquals(dialled, ["https://example.com/go"]);
});

Deno.test("an honest redirect chain is followed and the final page returned", async () => {
  const f = safeFetch(routes({
    "https://short.example/x": () => new Response(null, { status: 301, headers: { location: "https://long.example/page" } }),
    "https://long.example/page": () => new Response("hello", { status: 200 }),
  }), publicDns);
  const res = await f("https://short.example/x");
  assertEquals(await res.text(), "hello");
});

Deno.test("a caller that follows redirects itself gets the 3xx back — and its next hop comes through here too", async () => {
  const f = safeFetch(routes({ "https://short.example/x": () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }) }), publicDns);
  const res = await f("https://short.example/x", { redirect: "manual" });
  assertEquals(res.status, 302);
  await assertRejects(() => f(new URL(res.headers.get("location")!, "https://short.example/x").toString(), { redirect: "manual" }), Error, "private address");
});

Deno.test("a loop of redirects ends", async () => {
  const f = safeFetch(routes({ "https://a.example/": () => new Response(null, { status: 302, headers: { location: "https://a.example/" } }) }), publicDns);
  await assertRejects(() => f("https://a.example/"), Error, "too many redirects");
});
