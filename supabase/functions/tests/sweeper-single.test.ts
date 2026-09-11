import { assertEquals } from "jsr:@std/assert@1";
import { singleItemRequest } from "../sweeper/single.ts";

const ID = "6d03f7aa-1234-4abc-8def-0123456789ab";

Deno.test("singleItemRequest reads an item id and an optional retry flag", () => {
  assertEquals(singleItemRequest({ itemId: ID }), { itemId: ID, retry: false });
  assertEquals(singleItemRequest({ itemId: ID, retry: true }), { itemId: ID, retry: true });
  assertEquals(singleItemRequest({ itemId: ID, retry: "yes" }), { itemId: ID, retry: false });
});

Deno.test("singleItemRequest is null for the cron's empty body and for anything that is not a uuid", () => {
  assertEquals(singleItemRequest({}), null);
  assertEquals(singleItemRequest(null), null);
  assertEquals(singleItemRequest({ itemId: "not-a-uuid" }), null);
  assertEquals(singleItemRequest({ itemId: 42 }), null);
  assertEquals(singleItemRequest([ID]), null);
});
