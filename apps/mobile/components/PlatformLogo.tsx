import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { View, type StyleProp, type ViewStyle } from "react-native";
import {
  brandForPlatform,
  type Brand,
} from "../../../packages/platform-assets/catalog";
import { usePalette } from "../lib/theme";

// Static require calls let Metro bundle the same local artwork used by the dashboard.
const LOGOS: Record<Brand, { light: number; dark: number }> = {
  instagram: {
    light: require("../../../packages/platform-assets/assets/instagram.png"),
    dark: require("../../../packages/platform-assets/assets/instagram.png"),
  },
  youtube: {
    light: require("../../../packages/platform-assets/assets/youtube.png"),
    dark: require("../../../packages/platform-assets/assets/youtube.png"),
  },
  x: {
    light: require("../../../packages/platform-assets/assets/x-light.png"),
    dark: require("../../../packages/platform-assets/assets/x-dark.png"),
  },
  facebook: {
    light: require("../../../packages/platform-assets/assets/facebook.png"),
    dark: require("../../../packages/platform-assets/assets/facebook.png"),
  },
  tiktok: {
    light: require("../../../packages/platform-assets/assets/tiktok.png"),
    dark: require("../../../packages/platform-assets/assets/tiktok.png"),
  },
  reddit: {
    light: require("../../../packages/platform-assets/assets/reddit.png"),
    dark: require("../../../packages/platform-assets/assets/reddit.png"),
  },
  slack: {
    light: require("../../../packages/platform-assets/assets/slack.png"),
    dark: require("../../../packages/platform-assets/assets/slack.png"),
  },
  whatsapp: {
    light: require("../../../packages/platform-assets/assets/whatsapp.png"),
    dark: require("../../../packages/platform-assets/assets/whatsapp.png"),
  },
  threads: {
    light: require("../../../packages/platform-assets/assets/threads-light.png"),
    dark: require("../../../packages/platform-assets/assets/threads-dark.png"),
  },
  linkedin: {
    light: require("../../../packages/platform-assets/assets/linkedin.png"),
    dark: require("../../../packages/platform-assets/assets/linkedin.png"),
  },
  pinterest: {
    light: require("../../../packages/platform-assets/assets/pinterest.png"),
    dark: require("../../../packages/platform-assets/assets/pinterest.png"),
  },
  google: {
    light: require("../../../packages/platform-assets/assets/google.png"),
    dark: require("../../../packages/platform-assets/assets/google.png"),
  },
};
export function PlatformLogo({
  platform,
  size = 22,
  appearance,
  style,
}: {
  platform: string;
  size?: number;
  appearance?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const brand = brandForPlatform(platform);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
        style,
      ]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {brand ? (
        <Image
          source={LOGOS[brand][appearance ?? p.blur]}
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={0}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons
          name={platform === "note" ? "document-text-outline" : "globe-outline"}
          size={size}
          color={p.inkMuted}
        />
      )}
    </View>
  );
}
