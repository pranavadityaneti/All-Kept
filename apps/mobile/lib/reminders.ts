import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type { SessionState } from "./auth-state";
import { supabase } from "./supabase";

/**
 * Remind me on a save.
 *
 * The time is kept on the save, on the server, and the phone schedules a local notification for
 * it — which fires on time with the app closed and needs no server clock. The two are reconciled
 * on every foreground, so a reinstall or a second phone does not lose a reminder, and one cleared
 * on one phone is cleared on the other. Tapping the notification opens the save, through the same
 * route every notification takes.
 */

export interface Preset { label: string; at: number }
export interface Pending { id: string; at: number }

const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo, d, h, mi, 0, 0).getTime();

/** Tonight, tomorrow morning, the weekend, next week — each only while it is still ahead. */
export function presetTimes(now: Date): Preset[] {
  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  const soon = now.getTime() + 30 * 60_000;
  const out: Preset[] = [];
  const tonight = local(y, mo, d, 20);
  if (tonight >= soon) out.push({ label: "Tonight 8pm", at: tonight });
  out.push({ label: "Tomorrow 9am", at: local(y, mo, d + 1, 9) });
  // Saturday at ten; this Saturday only while its morning is still ahead.
  const untilSaturday = (6 - now.getDay() + 7) % 7;
  let weekend = local(y, mo, d + untilSaturday, 10);
  if (weekend < soon) weekend = local(y, mo, d + untilSaturday + 7, 10);
  out.push({ label: "This weekend", at: weekend });
  // Monday at nine, always the coming one — today's Monday morning is not "next week".
  const untilMonday = ((1 - now.getDay() + 7) % 7) || 7;
  out.push({ label: "Next week", at: local(y, mo, d + untilMonday, 9) });
  return out;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tomorrow, 9:00 am" — the day as people say it, the time as a clock shows it. */
export function describeReminder(at: number, now: Date): string {
  const t = new Date(at);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(t) - midnight(now)) / 86_400_000);
  const hour = t.getHours() % 12 || 12;
  const time = `${hour}:${String(t.getMinutes()).padStart(2, "0")} ${t.getHours() < 12 ? "am" : "pm"}`;
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow"
    : `${DAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}${t.getFullYear() !== now.getFullYear() ? ` ${t.getFullYear()}` : ""}`;
  return `${day}, ${time}`;
}

/** What to schedule and what to cancel so the phone's list matches the server's. */
export function reconcileReminders(server: Pending[], phone: Pending[]): { schedule: Pending[]; cancel: string[] } {
  const schedule = server.filter((s) => !phone.some((p) => p.id === s.id && p.at === s.at));
  const cancel = phone.filter((p) => !server.some((s) => s.id === p.id)).map((p) => p.id);
  return { schedule, cancel };
}

const identifier = (id: string) => `reminder:${id}`;

/** Asks the OS once, at the moment a reminder is being set, which is the moment it makes sense. */
export async function reminderPermission(): Promise<"granted" | "denied"> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return "granted";
  if (!existing.canAskAgain && existing.status === "denied") return "denied";
  return (await Notifications.requestPermissionsAsync()).granted ? "granted" : "denied";
}

/**
 * Android files each notification under a channel; a reminder had none, so it went to the fallback
 * ("Miscellaneous"), which shows its title on a locked screen. Its own channel: a reminder the
 * person set pops up, and stays private. The id is permanent; once made, the person owns its
 * settings. iPhone has no channels.
 */
const REMINDER_CHANNEL = "reminders";
async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: "Reminders you set",
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function scheduleReminder(id: string, at: number, title: string): Promise<void> {
  await ensureReminderChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: identifier(id),
    content: { title: "Allkept reminder", body: title, data: { itemId: id, at } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: REMINDER_CHANNEL },
  });
}

export const cancelReminder = (id: string): Promise<void> => Notifications.cancelScheduledNotificationAsync(identifier(id));

/** The reminders the phone has scheduled, read back from what was written into each one — with the channel it sits on (Android). */
async function scheduledReminders(): Promise<(Pending & { channel: string | null })[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.flatMap((n) => {
    if (!n.identifier.startsWith("reminder:")) return [];
    const data = n.content.data as { itemId?: unknown; at?: unknown } | null;
    const channel = (n.trigger as { channelId?: unknown } | null)?.channelId;
    return typeof data?.itemId === "string" && typeof data?.at === "number" ? [{ id: data.itemId, at: data.at, channel: typeof channel === "string" ? channel : null }] : [];
  });
}

/**
 * Everything this phone holds for an account that has left it — the reminders still to come and
 * the notifications already in the list — is forgotten: a pending reminder would show a save's
 * title to whoever holds the phone next. Signing back in schedules that account's reminders again
 * from the server (syncReminders).
 */
export async function forgetLocalNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
}

/**
 * Forgets them the moment the phone stops being signed in to the account it was: signed out, the
 * account deleted (which signs out), a session that ended, or another account signed in. A launch,
 * or a moment the session can't be read, is not a change of account.
 */
export function useForgetOnSignOut(session: SessionState): void {
  const owner = session.status === "ready" ? session.userId : session.status === "signed_out" ? null : undefined;
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (owner === undefined) return;
    if (typeof last.current === "string" && owner !== last.current) void forgetLocalNotifications();
    last.current = owner;
  }, [owner]);
}

/** Brings the phone's schedule in line with the server's list of what is still to come. Never throws: a reminder is not worth a crash. */
export async function syncReminders(): Promise<void> {
  try {
    // The channel is made here — at launch and each return — so it is there before any reminder needs it.
    await ensureReminderChannel().catch(() => undefined);
    const { data, error } = await supabase.from("items").select("id,remind_at,title,text").gt("remind_at", new Date().toISOString());
    if (error || !data) return;
    const server = (data as { id: string; remind_at: string; title: string | null; text: string | null }[]).map((r) => ({ id: r.id, at: Date.parse(r.remind_at), title: r.title?.trim() || r.text?.split("\n").find((l) => l.trim())?.trim() || "A save you wanted back" }));
    const phone = await scheduledReminders();
    // Android: a reminder scheduled before reminders had their own channel is moved onto it —
    // cancelled here, and scheduled again below if it is still to come.
    const moved = Platform.OS === "android" ? phone.filter((p) => p.channel !== REMINDER_CHANNEL) : [];
    for (const p of moved) await cancelReminder(p.id).catch(() => undefined);
    const { schedule, cancel } = reconcileReminders(server, phone.filter((p) => !moved.includes(p)));
    for (const id of cancel) await cancelReminder(id).catch(() => undefined);
    for (const s of schedule) await scheduleReminder(s.id, s.at, server.find((r) => r.id === s.id)?.title ?? "A save you wanted back").catch(() => undefined);
  } catch {
    // Offline, or notifications unavailable: the next foreground tries again.
  }
}
