import { AppState } from "react-native";

/**
 * Whether videos play with sound, for this stretch of use.
 *
 * Every launch starts silent. One tap on a speaker turns sound on for the videos opened after it.
 * A quick glance away — answering a notification, checking another app — keeps that choice, but a
 * real absence clears it, so a reel never surprises someone at full volume in a quiet room hours
 * later. Nothing is written to disk: a fresh launch is silent regardless.
 */
let on = false;
const listeners = new Set<(on: boolean) => void>();

/** Long enough to outlast a glance at another app, short enough that "later" always starts silent. */
export const RESET_AFTER_MS = 30_000;

export function soundOn(): boolean { return on; }

export function setSoundOn(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn(on);
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// The moment the app left the foreground, or null while it is in front. Set once on the way out so a
// second background-type event (iOS sends 'inactive' then 'background') cannot restart the clock.
let awayAt: number | null = null;
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    if (awayAt !== null && Date.now() - awayAt > RESET_AFTER_MS) setSoundOn(false);
    awayAt = null;
  } else if (awayAt === null) {
    awayAt = Date.now();
  }
});
