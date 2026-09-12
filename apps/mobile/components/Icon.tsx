import { brandForPlatform, type Brand } from "../../../packages/platform-assets/catalog";
import { PlatformLogo } from "./PlatformLogo";
import { Ionicons } from "@expo/vector-icons";
import { resolveGlyph, type Glyph, type SemanticName } from "../lib/icon-names";
import type { ColorValue, StyleProp, TextStyle } from "react-native";

export type { Glyph } from "../lib/icon-names";
export type IconName = SemanticName | Brand;

export function Icon({ name, size = 22, color, style }: { name: IconName | Glyph; size?: number; color: ColorValue; style?: StyleProp<TextStyle> }) {
  if (brandForPlatform(name)) return <PlatformLogo platform={name} size={size} style={style} />;
  return <Ionicons name={resolveGlyph(name)} size={size} color={color as string} style={style} />;
}
