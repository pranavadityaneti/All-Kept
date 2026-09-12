/**
 * Rounded, soft-cornered icons. One map, so a screen never reaches for a set directly.
 *
 * The map and the rule that reads it live here rather than in the component so both can be tested
 * without a renderer — the precedence below is easy to break and silent when broken.
 */
import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/**
 * A glyph named directly, for the one case a semantic key cannot serve: a category carries its own
 * mark, and a category a person invents is named at runtime. Typed against the font rather than
 * cast, so a misspelt glyph is a compile error instead of a blank space on the tile.
 */
export type Glyph = ComponentProps<typeof Ionicons>["name"];

export const NAMES = {
  home: "home-outline",
  homeActive: "home",
  library: "albums-outline",
  libraryActive: "albums",
  settings: "settings-outline",
  settingsActive: "settings",
  bell: "notifications-outline",
  moon: "moon-outline",
  search: "search-outline",
  close: "close",
  chevron: "chevron-forward",
  share: "share-outline",
  trash: "trash-outline",
  open: "open-outline",
  check: "checkmark",
  camera: "camera-outline",
  add: "add",
  down: "chevron-down",
  back: "arrow-back",
  download: "cloud-download-outline",
  web: "globe-outline",
  note: "document-text-outline",
  apple: "logo-apple",
  sound: "volume-high-outline",
  soundOff: "volume-mute-outline",
} as const satisfies Record<string, Glyph>;

/** A semantic key wins over a glyph of the same spelling: "home" stays the outline the tab bar asks for. */
export const resolveGlyph = (name: string): Glyph => (NAMES as Record<string, Glyph>)[name] ?? (name as Glyph);

/** The keys a screen asks for by meaning rather than by glyph. */
export type SemanticName = keyof typeof NAMES;
