import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners: ((state: string) => void)[] = [];
vi.mock("react-native", () => ({
  AppState: { addEventListener: (_: string, fn: (state: string) => void) => { listeners.push(fn); return { remove() { listeners.splice(listeners.indexOf(fn), 1); } }; } },
}));

describe("the session's sound choice", () => {
  beforeEach(() => { vi.resetModules(); listeners.length = 0; });

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

  it("goes silent again when the app leaves the foreground, and says so", async () => {
    const sound = await import("../lib/sound");
    const heard: boolean[] = [];
    sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(true);
    expect(listeners.length).toBe(1);
    listeners[0]!("background");
    expect(sound.soundOn()).toBe(false);
    expect(heard).toEqual([true, false]);
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
