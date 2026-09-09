import { Image, type ColorValue, type ImageStyle, type StyleProp } from "react-native";

/** Line icons drawn as assets, so the app carries no icon library. */
const SOURCES = {
  home: require("../assets/icon-home.png"),
  library: require("../assets/icon-library.png"),
  settings: require("../assets/icon-settings.png"),
  bell: require("../assets/icon-bell.png"),
  search: require("../assets/icon-search.png"),
} as const;

export type IconName = keyof typeof SOURCES;

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<ImageStyle> }) {
  return <Image source={SOURCES[name]} style={[{ width: size, height: size, tintColor: color }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
