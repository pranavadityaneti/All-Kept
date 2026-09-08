import type { ExpoConfig } from "expo/config";

/** Identifiers are fixed in the Phase 0 spec: display name Allkept, bundle id and package app.allkept.mobile, scheme allkept. */
const config: ExpoConfig = {
  name: "Allkept",
  slug: "allkept",
  scheme: "allkept",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "app.allkept.mobile", supportsTablet: false },
  android: { package: "app.allkept.mobile" },
  plugins: ["expo-router", "expo-secure-store"],
};

export default config;
