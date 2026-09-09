import { useColorScheme } from "react-native";

/**
 * One palette. The app is dark by choice, not by device setting, so there is no light variant and
 * no switch; the brand's violet leads and its orange is kept for emphasis.
 */
export interface Palette {
  bg: string; surface: string; surfaceAlt: string; border: string;
  ink: string; inkMuted: string; accent: string; accentInk: string; accentSoft: string;
  highlight: string; good: string; warn: string; bad: string;
}

const dark: Palette = {
  bg: "#0E0F14", surface: "#171922", surfaceAlt: "#1F2230", border: "#2B2F3F",
  ink: "#F3F4F8", inkMuted: "#98A0B4", accent: "#7C5CF6", accentInk: "#FFFFFF", accentSoft: "#241F44",
  highlight: "#F5883C", good: "#5FCB8A", warn: "#E5B454", bad: "#F07A70",
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

/** Kept as a hook so screens do not need to know that the theme is fixed. */
export function usePalette(): Palette {
  useColorScheme(); // subscribes, so a future light theme needs no changes here
  return dark;
}
