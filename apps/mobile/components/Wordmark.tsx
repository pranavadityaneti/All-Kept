import { Image } from "react-native";
import { usePalette } from "../lib/theme";

// Two cuts of the same mark, and they must be the same mark: the wordmark is near-black, so on a
// dark ground the light artwork leaves only the bookmark visible and the name disappears.
//
// The dark cut used to be brand/lockup-dark.png, which is a different lockup altogether — stacked
// rather than horizontal, 1.39:1 against this one's 2.52:1, with an opaque plate baked in. Sized by
// height, as it is here, that drew a small plated square where the other screens had a wide mark.
// These two now match to the pixel. lockup-dark.png stays where it is: it is the splash image, and
// the splash is a fingerprint input, so replacing it would cut existing builds off from updates.
const LIGHT = require("../assets/Home_All Kept_Logo.png");
const DARK = require("../assets/Dark Home_All Kept_Logo.png");

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
export function Wordmark({ height = 36 }: { height?: number }) {
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
