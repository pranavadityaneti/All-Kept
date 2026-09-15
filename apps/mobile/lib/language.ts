import AsyncStorage from "@react-native-async-storage/async-storage";
import { languageFromLocale } from "./category-summary";
import { supabase } from "./supabase";

/**
 * The phone's language, told to the server so the sorter writes each save's summary in it.
 *
 * Written on the profile once, and again only when it changed — the phone remembers what it last
 * sent — so every launch does not carry a write. A save sorted before the change is caught by the
 * sweeper's re-sort pass, which compares the row's summary language with the profile's.
 */
const SENT_KEY = "allkept.language.sent";

export const shouldSendLanguage = (current: string, sent: string | null): boolean => current !== sent;

export async function reportLanguage(): Promise<void> {
  const current = languageFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  let sent: string | null = null;
  try { sent = await AsyncStorage.getItem(SENT_KEY); } catch { sent = null; }
  if (!shouldSendLanguage(current, sent)) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("profiles").update({ language: current }).eq("user_id", user.id);
  if (error) return;
  await AsyncStorage.setItem(SENT_KEY, current).catch(() => undefined);
}
