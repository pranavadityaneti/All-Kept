import type { ExpoConfig } from "expo/config";

/** Identifiers are fixed in the Phase 0 spec: display name Allkept, bundle id and package app.allkept.mobile, scheme allkept. */
const config: ExpoConfig = {
  name: "Allkept",
  slug: "all-kept", // matches the EAS project and the GitHub repository; not visible in the app
  scheme: "allkept",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "app.allkept.mobile",
    supportsTablet: false,
    // The app uses only standard HTTPS, which is exempt. Declaring it here saves answering the
    // encryption question by hand in App Store Connect for every single build.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "app.allkept.mobile",
    // White, not the app's dark ground: the mark's lower edge is an alpha fade to cream, drawn
    // for a white background. Over anything dark it composites to a muddy tan.
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FFFFFF" },
  },
  // The EAS project Pranav created on 8 Sep 2026. Builds and over-the-air updates resolve through it.
  extra: { eas: { projectId: "55c2d8b3-2f30-462b-b052-2a685de0aa54" } },
  updates: {
    url: "https://u.expo.dev/55c2d8b3-2f30-462b-b052-2a685de0aa54",
    // The app does its own checking (see lib/updates.ts) so it can apply an update on this launch
    // rather than the next one; leaving the automatic check on would download everything twice.
    checkAutomatically: "ON_ERROR_RECOVERY",
  },
  // Fingerprint, not app version: an update is offered only to builds whose native side matches,
  // so a JavaScript-only change ships over the air and a change that needs new native code does not.
  runtimeVersion: { policy: "fingerprint" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-image-picker", { photosPermission: "Choose a photo for your Allkept profile.", cameraPermission: false, microphonePermission: false }],
    ["expo-sharing", {
      ios: { enabled: true, activationRule: { supportsText: true, supportsWebUrlWithMaxCount: 1 } },
      android: { enabled: true, singleShareMimeTypes: ["text/plain"] },
    }],
    // The splash is the welcome screen's first frame, not a second thing before it. Same ground,
    // same lockup, so launching reads as one continuous moment instead of a white card cutting to a
    // dark one. The dark lockup carries a baked-in plate rather than transparency, which is invisible
    // here only because that plate is within two levels of this background; changing either means
    // checking both.
    ["expo-splash-screen", { image: "./assets/brand/lockup-dark.png", imageWidth: 220, backgroundColor: "#0E0F14", dark: { backgroundColor: "#0E0F14" } }],
  ],
};

export default config;
