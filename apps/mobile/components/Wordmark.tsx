import { Image } from "react-native";

const SOURCE = require("../assets/wordmark.png");
const asset = Image.resolveAssetSource(SOURCE);
// Read the shape from the file, so replacing the artwork needs no code change.
const ratio = asset && asset.height ? asset.width / asset.height : 3.6;

/** The brand mark. An image, so its gradient needs no drawing library. */
export function Wordmark({ height = 30 }: { height?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ height, width: height * ratio }}
      resizeMode="contain"
      accessibilityLabel="Allkept"
      accessibilityIgnoresInvertColors
    />
  );
}
