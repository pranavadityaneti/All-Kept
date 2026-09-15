import type { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { clearCredential, dropQueued, hasCredential, peekQueue, setCredential } from "../modules/share-save";
import { invalidateLibrary } from "./library";
import { httpStatus } from "./paywall";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

const platform = (): "ios" | "android" => (Platform.OS === "android" ? "android" : "ios");

/** Mints the share extension's credential once per install; the module remembers it. A failure is retried next foreground. */
export async function ensureShareToken(): Promise<void> {
  if (hasCredential()) return;
  const { data, error } = await supabase.functions.invoke<{ token: string }>("share-token", { body: { action: "create", platform: platform() } });
  if (error || !data?.token) return;
  setCredential({ token: data.token, endpoint: `${supabaseUrl}/functions/v1/save-link`, apikey: supabaseAnonKey });
}

/** Sign-out and account deletion: the server forgets the token, and so does the phone — even offline. */
export async function revokeShareToken(): Promise<void> {
  await supabase.functions.invoke("share-token", { body: { action: "revoke", platform: platform() } }).catch(() => undefined);
  clearCredential();
}

/**
 * Delivers what the extension queued while offline, each with the request id it was queued under,
 * so a retry can never double-save. Stops at the first network failure; runs again next foreground.
 *
 * A 402 — the free saves are used and there is no subscription — keeps the item queued and stops:
 * everything behind it would be refused for the same reason, and the item is delivered by the next
 * flush after the person subscribes. `blocked` is how the app knows to say so, and `waiting` how
 * many it has to say it about.
 */
export async function flushShareQueue(queryClient: QueryClient): Promise<{ delivered: number; blocked: boolean; waiting: number }> {
  let delivered = 0;
  let blocked = false;
  for (const item of peekQueue()) {
    const { data, error } = await supabase.functions.invoke<{ itemId?: string }>("save-link", { body: { text: item.text, requestId: item.requestId } });
    if (error) {
      const status = httpStatus(error);
      if (status === 400) { dropQueued(item.requestId); continue; } // never going to be a link
      if (status === 402) { blocked = true; }
      break;
    }
    if (data?.itemId) { dropQueued(item.requestId); delivered++; }
  }
  if (delivered) invalidateLibrary(queryClient);
  return { delivered, blocked, waiting: blocked ? peekQueue().length : 0 };
}
