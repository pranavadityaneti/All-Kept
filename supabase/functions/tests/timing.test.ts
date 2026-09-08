import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { TIMED_OUT, within } from "../_shared/timing.ts";

Deno.test("within: fast work returns its value, slow work returns TIMED_OUT and keeps running, failures propagate", async () => {
  assertEquals(await within(Promise.resolve("done"), 50), "done");
  let finished = false;
  const slow = new Promise<string>((resolve) => setTimeout(() => { finished = true; resolve("late"); }, 40));
  assertEquals(await within(slow, 5), TIMED_OUT);
  assertEquals(finished, false);
  assertEquals(await slow, "late"); // the work was not cancelled
  await assertRejects(() => within(Promise.reject(new Error("boom")), 50), Error, "boom");
});
