import { Image } from "react-native";
import { usePalette } from "../lib/theme";

// Two cuts of the same mark. The wordmark is near-black, so on a dark ground the light artwork
// leaves only the bookmark visible and the name disappears — the same fault that hid it on the
// splash this morning. Picking by theme closes it wherever the mark is used.
const LIGHT = require("../assets/Home_All Kept_Logo.png");
const DARK = require("../assets/brand/lockup-dark.png");

/** Read the shape from the file, so replacing the artwork needs no code change. */
const shapeOf = (src: number) => {
  const asset = Image.resolveAssetSource(src);
  return asset && asset.height ? asset.width / asset.height : 3.6;
};
const RATIO = { light: shapeOf(LIGHT), dark: shapeOf(DARK) };

/**
 * The brand mark. An image, so its gradient needs no drawing library.
 *
 * The height is deliberately not set at the call sites: the mark should be the same size on every
 * screen it appears on, and three screens each passing their own number is how that drifts apart.
 */
export function Wordmark({ height = 32 }: { height?: number }) {
  const p = usePalette();
  const dark = p.blur === "dark";
  return (
    <Image
      source={dark ? DARK : LIGHT}
      style={{ height, width: height * (dark ? RATIO.dark : RATIO.light) }}
      resizeMode="contain"
      accessibilityLabel="Allkept"
      accessibilityIgnoresInvertColors
    />
  );
}
