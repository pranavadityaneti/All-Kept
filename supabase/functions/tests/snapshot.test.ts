import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MAX_STORED_THUMB_BYTES, snapshotTo } from "../_shared/pipeline.ts";

type Upload = { path: string; type: string; bytes: number };
const fakeDb = (uploads: Upload[], failWith: string | null = null) => ({
  storage: { from: (_bucket: string) => ({ upload: async (path: string, bytes: Uint8Array, opts: { contentType: string }) => { uploads.push({ path, type: opts.contentType, bytes: bytes.byteLength }); return { error: failWith ? { message: failWith } : null }; } }) },
}) as unknown as SupabaseClient;
const respond = (status: number, body: BodyInit | null, headers: Record<string, string> = {}): typeof fetch => (async () => new Response(body, { status, headers })) as typeof fetch;

Deno.test("snapshot: an image is stored under the user and item with the extension of its type", async () => {
  const uploads: Upload[] = [];
  assertEquals(await snapshotTo(fakeDb(uploads), respond(200, new Uint8Array(10), { "content-type": "image/jpeg" }), "u1", "i1", "https://cdn/x"), "u1/i1.jpg");
  assertEquals(await snapshotTo(fakeDb(uploads), respond(200, new Uint8Array(10), { "content-type": "image/png; charset=binary" }), "u1", "i2", "https://cdn/y"), "u1/i2.png");
  assertEquals(uploads, [{ path: "u1/i1.jpg", type: "image/jpeg", bytes: 10 }, { path: "u1/i2.png", type: "image/png", bytes: 10 }]);
});

Deno.test("snapshot: every way of storing nothing throws a reason, never a silent null", async () => {
  const uploads: Upload[] = [];
  const reason = async (f: typeof fetch, db = fakeDb(uploads)) => { try { await snapshotTo(db, f, "u1", "i1", "https://cdn/x"); return "stored"; } catch (e) { return (e as Error).message; } };
  assertEquals(await reason(respond(404, "gone")), "http 404");
  assertEquals(await reason(respond(200, "<html>", { "content-type": "text/html" })), "not an image: text/html");
  assertEquals(await reason(respond(200, new Uint8Array(0), { "content-type": "image/jpeg" })), "empty body");
  assertEquals(await reason(respond(200, new Uint8Array(10), { "content-type": "image/jpeg", "content-length": "5000000" })), "too large: 5000000 bytes");
  assertEquals(await reason(respond(200, new Uint8Array(MAX_STORED_THUMB_BYTES + 1), { "content-type": "image/jpeg" })), `too large: ${MAX_STORED_THUMB_BYTES + 1} bytes`);
  assertEquals(await reason(respond(200, new Uint8Array(10), { "content-type": "image/jpeg" }), fakeDb(uploads, "boom")), "upload: boom");
  await assertRejects(() => snapshotTo(fakeDb(uploads), (async () => { throw new TypeError("network down"); }) as typeof fetch, "u1", "i1", "https://cdn/x"), TypeError);
  assert(uploads.length === 1); // only the upload-error case reached storage
});

Deno.test("snapshot: a 2.1 MB Instagram post image is now stored (the old 2 MB cap dropped it)", async () => {
  const uploads: Upload[] = [];
  assertEquals(await snapshotTo(fakeDb(uploads), respond(200, new Uint8Array(2_113_627), { "content-type": "image/jpeg", "content-length": "2113627" }), "u1", "i1", "https://lookaside.fbsbx.com/x"), "u1/i1.jpg");
  assertEquals(uploads[0]!.bytes, 2_113_627);
});

Deno.test("the picture for the model: read from the bucket as bytes; refused types, oversize and unreadable ones are skipped with a reason", async () => {
  const { pictureForModel } = await import("../_shared/pipeline.ts");
  const logged: string[] = [];
  const log = (m: string) => { logged.push(m); };
  const dbWith = (file: { bytes: Uint8Array; type: string } | null, error: { message: string } | null = null) => ({
    storage: { from: (_bucket: string) => ({ download: async (_path: string) => ({ data: file ? new Blob([file.bytes as BlobPart], { type: file.type }) : null, error }) }) },
  }) as unknown as SupabaseClient;

  const jpeg = await pictureForModel(dbWith({ bytes: new Uint8Array([255, 216, 255]), type: "image/jpeg" }), "u1/i1.jpg", log);
  assertEquals(jpeg, { mediaType: "image/jpeg", base64: "/9j/" });
  // A blob without a declared type takes its type from the name; the models take jpeg, png, webp, gif.
  assertEquals((await pictureForModel(dbWith({ bytes: new Uint8Array([1]), type: "" }), "u1/i2.webp", log))?.mediaType, "image/webp");
  assertEquals(await pictureForModel(dbWith({ bytes: new Uint8Array([1]), type: "image/heic" }), "u1/i3.heic", log), null);
  assertEquals(await pictureForModel(dbWith({ bytes: new Uint8Array(3_500_001), type: "image/jpeg" }), "u1/i4.jpg", log), null);
  assertEquals(await pictureForModel(dbWith(null, { message: "object not found" }), "u1/gone.jpg", log), null);
  assertEquals(logged, [
    "pipeline: picture type not for the model, sorting from words",
    "pipeline: picture too large for the model, sorting from words",
    "pipeline: picture unreadable, sorting from words",
  ]);
});
