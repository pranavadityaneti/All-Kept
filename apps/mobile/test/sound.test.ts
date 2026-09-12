import { beforeEach, describe, expect, it, vi } from "vitest";

let now = 0;
const listeners: ((state: string) => void)[] = [];
vi.mock("react-native", () => ({
  AppState: { addEventListener: (_: string, fn: (state: string) => void) => { listeners.push(fn); return { remove() { listeners.splice(listeners.indexOf(fn), 1); } }; } },
}));

describe("the session's sound choice", () => {
  beforeEach(() => { vi.resetModules(); listeners.length = 0; now = 1_000_000; vi.spyOn(Date, "now").mockImplementation(() => now); });

  it("starts silent, remembers a tap, and tells whoever is listening", async () => {
    const sound = await import("../lib/sound");
    expect(sound.soundOn()).toBe(false);
    const heard: boolean[] = [];
    const stop = sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(true);
    expect(sound.soundOn()).toBe(true);
    expect(heard).toEqual([true]);
    stop();
    sound.setSoundOn(false);
    expect(heard).toEqual([true]);
  });

  it("keeps the choice through a quick glance away, so a notification-check does not mute you", async () => {
    const sound = await import("../lib/sound");
    sound.setSoundOn(true);
    listeners[0]!("inactive");
    listeners[0]!("background");
    now += 5_000; // back within a few seconds
    listeners[0]!("active");
    expect(sound.soundOn()).toBe(true);
  });

  it("resets the choice after a real absence, so a reel never surprises you loudly later", async () => {
    const sound = await import("../lib/sound");
    const heard: boolean[] = [];
    sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(true);
    listeners[0]!("inactive");
    listeners[0]!("background");
    now += sound.RESET_AFTER_MS + 1;
    listeners[0]!("active");
    expect(sound.soundOn()).toBe(false);
    expect(heard).toEqual([true, false]);
  });

  it("measures the absence from when you left, not the last background event", async () => {
    const sound = await import("../lib/sound");
    sound.setSoundOn(true);
    listeners[0]!("inactive"); // the clock starts here
    now += 20_000;
    listeners[0]!("background"); // a later event must not restart the clock
    now += sound.RESET_AFTER_MS - 20_000 + 1; // total absence just over the threshold
    listeners[0]!("active");
    expect(sound.soundOn()).toBe(false);
  });

  it("does not announce a choice that did not change", async () => {
    const sound = await import("../lib/sound");
    const heard: boolean[] = [];
    sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(false);
    expect(heard).toEqual([]);
  });
});
