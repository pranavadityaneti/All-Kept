import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export interface Palette {
  bg: string; surface: string; surfaceAlt: string; border: string;
  ink: string; inkMuted: string; accent: string; accentInk: string; accentSoft: string;
  highlight: string; good: string; warn: string; bad: string;
  /** Behind the floating bar, where a translucent layer sits over whatever is scrolling past. */
  floating: string;
  blur: "light" | "dark";
}

const light: Palette = {
  bg: "#F6F7FA", surface: "#FFFFFF", surfaceAlt: "#EEF0F6", border: "#DFE3EC",
  ink: "#14161C", inkMuted: "#5F6675", accent: "#6D46F2", accentInk: "#FFFFFF", accentSoft: "#EDE8FF",
  highlight: "#E4762A", good: "#2E7D4F", warn: "#9A6A12", bad: "#B3372F",
  floating: "rgba(255,255,255,0.82)", blur: "light",
};

const dark: Palette = {
  bg: "#0E0F14", surface: "#171922", surfaceAlt: "#1F2230", border: "#2B2F3F",
  ink: "#F3F4F8", inkMuted: "#98A0B4", accent: "#7C5CF6", accentInk: "#FFFFFF", accentSoft: "#241F44",
  highlight: "#F5883C", good: "#5FCB8A", warn: "#E5B454", bad: "#F07A70",
  floating: "rgba(23,25,34,0.82)", blur: "dark",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 12, lg: 18, xl: 24, pill: 999 } as const;
export const type = {
  title: { fontSize: 26, fontWeight: "700" },
  section: { fontSize: 19, fontWeight: "700" },
  heading: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "500" },
  mono: { fontSize: 32, fontWeight: "700", letterSpacing: 6 },
} as const;

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "allkept.theme";

/** The choice, shared by every screen so they cannot disagree, and remembered between launches. */
// Light by default: the library is a wall of other people's pictures, and a light ground lets them
// read as they were made. Dark stays a choice in Settings for anyone who wants it.
let choice: ThemeChoice = "light";
const listeners = new Set<(c: ThemeChoice) => void>();
let loaded = false;

function announce() { for (const l of listeners) l(choice); }

export async function loadThemeChoice(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") { choice = stored; announce(); }
  } catch { /* a phone that cannot read it simply follows the system */ }
}

export function useThemeChoice(): { choice: ThemeChoice; setChoice: (c: ThemeChoice) => void } {
  const [current, setCurrent] = useState<ThemeChoice>(choice);
  useEffect(() => {
    void loadThemeChoice();
    const listener = (c: ThemeChoice) => setCurrent(c);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const setChoice = useCallback((c: ThemeChoice) => {
    choice = c;
    announce();
    void AsyncStorage.setItem(KEY, c).catch(() => undefined);
  }, []);
  return { choice: current, setChoice };
}

export function usePalette(forced?: "light" | "dark"): Palette {
  const system = useColorScheme();
  const { choice: current } = useThemeChoice();
  return useMemo(() => {
    const resolved = forced ?? (current === "system" ? (system === "dark" ? "dark" : "light") : current);
    return resolved === "dark" ? dark : light;
  }, [current, forced, system]);
}
