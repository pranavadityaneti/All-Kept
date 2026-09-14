import { loadFont } from "@remotion/google-fonts/Inter";

const inter = loadFont("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });

export const fontFamily = inter.fontFamily;
