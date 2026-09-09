import { Ionicons } from "@expo/vector-icons";
import type { ColorValue, StyleProp, TextStyle } from "react-native";

/** Rounded, soft-cornered icons. One map, so a screen never reaches for a set directly. */
const NAMES = {
  home: "home-outline",
  homeActive: "home",
  library: "albums-outline",
  libraryActive: "albums",
  settings: "settings-outline",
  settingsActive: "settings",
  bell: "notifications-outline",
  search: "search-outline",
  close: "close",
  chevron: "chevron-forward",
  share: "share-outline",
  trash: "trash-outline",
  open: "open-outline",
  check: "checkmark",
} as const;

export type IconName = keyof typeof NAMES;

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={NAMES[name]} size={size} color={color as string} style={style} />;
}
