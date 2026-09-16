import { describe, expect, it } from "vitest";
import { serverSaid } from "../lib/function-error";

/** supabase-js keeps the failed Response as `error.context`; Expo's fetch answers with its own class, so a plain object of the same shape stands in. */
const failed = (status: number, body: unknown, ok = true) => ({
  name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code",
  context: { status, clone() { return this; }, async json() { if (!ok) throw new SyntaxError("not JSON"); return body; } },
});

describe("serverSaid", () => {
  it("reads the function's own words and code from a response that is not an instance of Response", async () => {
    expect(await serverSaid(failed(503, { error: "Couldn't read your saves just now. Try again in a moment.", code: "unavailable" })))
      .toEqual({ error: "Couldn't read your saves just now. Try again in a moment.", code: "unavailable" });
  });
  it("gives nothing for a body that is not JSON, or one without the fields", async () => {
    expect(await serverSaid(failed(502, "<html>bad gateway</html>", false))).toBeNull();
    expect(await serverSaid(failed(500, { message: "worker limit" }))).toBeNull();
  });
  it("gives nothing when no response came back at all", async () => {
    expect(await serverSaid({ name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" })).toBeNull();
    expect(await serverSaid(null)).toBeNull();
  });
});
