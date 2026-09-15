import * as Notifications from "expo-notifications";
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

export async function scheduleReminder(id: string, at: number, title: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: identifier(id),
    content: { title: "Allkept reminder", body: title, data: { itemId: id, at } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

export const cancelReminder = (id: string): Promise<void> => Notifications.cancelScheduledNotificationAsync(identifier(id));

/** The reminders the phone has scheduled, read back from what was written into each one. */
async function scheduledReminders(): Promise<Pending[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.flatMap((n) => {
    if (!n.identifier.startsWith("reminder:")) return [];
    const data = n.content.data as { itemId?: unknown; at?: unknown } | null;
    return typeof data?.itemId === "string" && typeof data?.at === "number" ? [{ id: data.itemId, at: data.at }] : [];
  });
}

/** Brings the phone's schedule in line with the server's list of what is still to come. Never throws: a reminder is not worth a crash. */
export async function syncReminders(): Promise<void> {
  try {
    const { data, error } = await supabase.from("items").select("id,remind_at,title,text").gt("remind_at", new Date().toISOString());
    if (error || !data) return;
    const server = (data as { id: string; remind_at: string; title: string | null; text: string | null }[]).map((r) => ({ id: r.id, at: Date.parse(r.remind_at), title: r.title?.trim() || r.text?.split("\n").find((l) => l.trim())?.trim() || "A save you wanted back" }));
    const { schedule, cancel } = reconcileReminders(server, await scheduledReminders());
    for (const id of cancel) await cancelReminder(id).catch(() => undefined);
    for (const s of schedule) await scheduleReminder(s.id, s.at, server.find((r) => r.id === s.id)?.title ?? "A save you wanted back").catch(() => undefined);
  } catch {
    // Offline, or notifications unavailable: the next foreground tries again.
  }
}
