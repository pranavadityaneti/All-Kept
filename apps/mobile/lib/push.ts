// Registering this device to be told when something happens to a save.
//
// The permission is asked for exactly once, and only when someone turns the switch on in Settings.
// Asking on first launch is the version everyone declines — iOS gives an app one chance at the
// system prompt, and spending it before the person knows what the app does spends it for good.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Linking, Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * What a notification does while Allkept is the app on screen.
 *
 * A banner still shows: a save finishing its sorting while you are looking at the library is worth
 * knowing about, and silently swallowing it would make the feature look broken to the one person
 * most likely to be testing it.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushOutcome =
  | { ok: true; token: string }
  /** The OS said no. Only Settings can undo this; the app cannot ask a second time. */
  | { ok: false; reason: "denied" }
  /** A simulator has no push service to register with. Not a failure worth showing anyone. */
  | { ok: false; reason: "simulator" }
  | { ok: false; reason: "failed"; detail: string };

const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

/**
 * Android draws its own channel; without one every notification arrives silently and the person
 * assumes the feature does not work. iOS ignores this entirely.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("saves", {
    name: "Saves",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Whether the OS has already been asked, without asking it. */
export async function pushPermission(): Promise<"granted" | "denied" | "undetermined"> {
  if (!Device.isDevice) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/**
 * Asks for permission if it has not been asked, then records this device against the person.
 *
 * The row is keyed on the token, so the same device signing in as someone else moves rather than
 * duplicates — otherwise the previous owner keeps being told about a library that is no longer
 * theirs, on a phone that is no longer theirs.
 */
export async function registerForPush(userId: string): Promise<PushOutcome> {
  if (!Device.isDevice) return { ok: false, reason: "simulator" };
  try {
    await ensureAndroidChannel();
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted
      ? existing.status
      : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return { ok: false, reason: "denied" };

    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})).data;
    const { error } = await supabase.from("device_push_tokens").upsert(
      {
        token,
        user_id: userId,
        platform: Platform.OS === "android" ? "android" : "ios",
        last_seen_at: new Date().toISOString(),
        // A token that starts working again should stop being treated as dead.
        failed_at: null,
        fail_reason: null,
      },
      { onConflict: "token" },
    );
    if (error) return { ok: false, reason: "failed", detail: error.message };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Forgets this device.
 *
 * Called when the switch goes off and when someone signs out. Leaving the row behind would keep a
 * signed-out phone ringing with someone else's saves, which is the worst version of this bug.
 */
export async function unregisterPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})).data;
    await supabase.from("device_push_tokens").delete().eq("token", token);
  } catch { /* a device that cannot be identified has nothing to forget */ }
}

/** The only way back from a refused permission is the OS's own settings. */
export const openSystemSettings = (): void => { void Linking.openSettings(); };

/**
 * Opens the save a notification was about.
 *
 * Two ways in, and both matter: a tap while the app is running, and a tap that launched it from
 * cold. The cold start is the one that is easy to miss — the response has already happened by the
 * time the listener is attached, so it has to be asked for as well as listened for.
 */
export function useNotificationRoute(go: (itemId: string) => void): void {
  useEffect(() => {
    let cancelled = false;
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.content.data?.["itemId"];
      if (!cancelled && typeof id === "string" && id) go(id);
    };
    // The tap that started the app, which has no listener to hear it.
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => { cancelled = true; sub.remove(); };
  }, [go]);
}
