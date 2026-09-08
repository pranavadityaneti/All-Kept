import type { ExpoConfig } from "expo/config";

/** Identifiers are fixed in the Phase 0 spec: display name Allkept, bundle id and package app.allkept.mobile, scheme allkept. */
const config: ExpoConfig = {
  name: "Allkept",
  slug: "allkept",
  scheme: "allkept",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: { bundleIdentifier: "app.allkept.mobile", supportsTablet: false },
  android: {
    package: "app.allkept.mobile",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#1F6F8B" },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 200, backgroundColor: "#1F6F8B", dark: { backgroundColor: "#0F1417" } }],
  ],
};

export default config;
