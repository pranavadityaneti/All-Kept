import type { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { clearCredential, dropQueued, hasCredential, peekQueue, setCredential } from "../modules/share-save";
import { invalidateLibrary } from "./library";
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

const statusOf = (error: unknown): number | undefined => (error as { context?: { status?: number } } | null)?.context?.status;

/**
 * Delivers what the extension queued while offline, each with the request id it was queued under,
 * so a retry can never double-save. Stops at the first network failure; runs again next foreground.
 */
export async function flushShareQueue(queryClient: QueryClient): Promise<number> {
  let delivered = 0;
  for (const item of peekQueue()) {
    const { data, error } = await supabase.functions.invoke<{ itemId?: string }>("save-link", { body: { text: item.text, requestId: item.requestId } });
    if (error) {
      if (statusOf(error) === 400) { dropQueued(item.requestId); continue; } // never going to be a link
      break;
    }
    if (data?.itemId) { dropQueued(item.requestId); delivered++; }
  }
  if (delivered) invalidateLibrary(queryClient);
  return delivered;
}
