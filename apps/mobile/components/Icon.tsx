import { brandForPlatform, type Brand } from "../../../packages/platform-assets/catalog";
import { PlatformLogo } from "./PlatformLogo";
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
  download: "cloud-download-outline",
  web: "globe-outline",
  note: "document-text-outline",
} as const;

export type IconName = keyof typeof NAMES | Brand;

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<TextStyle> }) {
  if (brandForPlatform(name)) return <PlatformLogo platform={name} size={size} style={style} />;
  return <Ionicons name={NAMES[name as keyof typeof NAMES]} size={size} color={color as string} style={style} />;
}
