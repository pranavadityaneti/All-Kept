import { useColorScheme } from "react-native";

/** One accent, two grounds. Kept small on purpose: no design-system dependency in Phase 0. */
export interface Palette {
  bg: string; surface: string; surfaceAlt: string; border: string;
  ink: string; inkMuted: string; accent: string; accentInk: string;
  good: string; warn: string; bad: string;
}

const light: Palette = {
  bg: "#F7F8FA", surface: "#FFFFFF", surfaceAlt: "#EEF1F5", border: "#DCE1E8",
  ink: "#131A21", inkMuted: "#5C6874", accent: "#1F6F8B", accentInk: "#FFFFFF",
  good: "#2E7D4F", warn: "#9A6A12", bad: "#B3372F",
};

const dark: Palette = {
  bg: "#0F1417", surface: "#161D22", surfaceAlt: "#1E272D", border: "#2A353C",
  ink: "#E4EAEE", inkMuted: "#93A0AA", accent: "#5FB3CF", accentInk: "#08181F",
  good: "#5FCB8A", warn: "#E5B454", bad: "#F07A70",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const type = {
  title: { fontSize: 26, fontWeight: "700" },
  heading: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "500" },
  mono: { fontSize: 32, fontWeight: "700", letterSpacing: 6 },
} as const;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
