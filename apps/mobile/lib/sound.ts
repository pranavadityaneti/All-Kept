import { AppState } from "react-native";

/**
 * Whether videos play with sound, for this session.
 *
 * Every save starts silent. One tap on a speaker turns the sound on for every save opened after
 * it, until Allkept goes to the background: a reel opening at full volume a day later, in a quiet
 * room, is the version of this people remember, so nothing here is written to disk.
 */
let on = false;
const listeners = new Set<(on: boolean) => void>();

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

AppState.addEventListener("change", (state) => { if (state !== "active") setSoundOn(false); });
