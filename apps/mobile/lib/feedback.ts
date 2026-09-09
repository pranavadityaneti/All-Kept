// Sending what somebody thinks to the people who can act on it.
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

/** Where support mail goes. The same address the store listings will carry. */
export const SUPPORT_EMAIL = "hi@allkept.app";

/** The App Store's own review sheet, opened directly. No native module needed for one link. */
export const REVIEW_URL = "https://apps.apple.com/app/id6809901300?action=write-review";

export const MAX_FEEDBACK = 4000;

/**
 * Records a message against the person who sent it.
 *
 * The build is sent with it, unasked, because "it does not work" means something different on
 * every one of them and nobody thinks to say which they are on.
 */
export async function sendFeedback(userId: string, message: string): Promise<void> {
  const text = message.trim();
  if (!text) throw new Error("Write something first.");
  if (text.length > MAX_FEEDBACK) throw new Error("That is too long to send.");
  const { error } = await supabase.from("feedback").insert({
    user_id: userId,
    message: text,
    app_version: `${Constants.expoConfig?.version ?? "?"}${Constants.expoConfig?.ios?.buildNumber ? ` (${Constants.expoConfig.ios.buildNumber})` : ""}`.slice(0, 40),
    platform: Platform.OS === "android" ? "android" : "ios",
  });
  // There is nothing to read back, by design, so a write that fails is the only signal there is.
  if (error) throw new Error("Could not send that. Check your connection and try again.");
}
