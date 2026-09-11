import { requireNativeModule } from "expo-modules-core";

export type ShareCredential = { token: string; endpoint: string; apikey: string };
export type QueuedShare = { text: string; requestId: string; at: number };

type Native = {
  setCredential(json: string): void;
  clearCredential(): void;
  hasCredential(): boolean;
  peekQueue(): string;
  dropQueued(requestId: string): void;
};
const native = requireNativeModule<Native>("ShareSave");

/** What the share extension needs to save on its own: the token, where to send it, and the anon key. */
export function setCredential(credential: ShareCredential): void { native.setCredential(JSON.stringify(credential)); }
export function clearCredential(): void { native.clearCredential(); }
export function hasCredential(): boolean { return native.hasCredential(); }
/** What the extension queued while offline. Read-only: drop each entry once it has been delivered. */
export function peekQueue(): QueuedShare[] {
  try {
    const parsed: unknown = JSON.parse(native.peekQueue() || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is QueuedShare =>
      typeof q === "object" && q !== null && typeof (q as QueuedShare).text === "string" && typeof (q as QueuedShare).requestId === "string");
  } catch { return []; }
}
export function dropQueued(requestId: string): void { native.dropQueued(requestId); }
