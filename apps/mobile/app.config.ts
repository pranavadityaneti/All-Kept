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
    // EAS syncs the App ID's capabilities to match this file on every build. Neither of these was
    // declared, so it tried to switch Sign in with Apple back *off* — Apple refuses that while a
    // Services ID is grouped with the bundle, the patch is atomic, and enabling push failed with
    // it. Declared here, the config says what the app actually uses and the sync agrees with
    // reality. usesAppleSignIn is true even though sign-in goes through the browser rather than
    // the native sheet: the capability belongs to the App ID, and turning it off breaks the
    // Services ID the browser flow depends on.
    usesAppleSignIn: true,
    // Signs the share extension target alongside the app (apple-targets needs it explicitly).
    appleTeamId: "9DBGLY5BVP",
    // The share extension reads the save token and the offline queue through this group.
    entitlements: { "com.apple.security.application-groups": ["group.app.allkept.mobile"] },
    // The app uses only standard HTTPS, which is exempt. Declaring it here saves answering the
    // encryption question by hand in App Store Connect for every single build.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "app.allkept.mobile",
    // Firebase project allkept-6a042, added 10 Sep 2026. Android push has no route around FCM: the
    // notification leaves Expo's service and reaches the device through Google, so without this file
    // the app builds clean and then fails at runtime with "Default FirebaseApp is not initialized".
    // Safe in the repo — the key inside is restricted to this package plus its signing certificate,
    // and it ships inside the APK regardless. The service-account key that authorises *sending*
    // lives in EAS credentials and must never land here.
    googleServicesFile: "./google-services.json",
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
    // The share sheet is served by our own extension (targets/share) and Android share activity
    // (modules/share-save); expo-sharing stays only for sharing *out*.
    "@bacons/apple-targets",
    // The splash is the welcome screen's first frame, not a second thing before it. Same ground,
    // same lockup, so launching reads as one continuous moment instead of a white card cutting to a
    // dark one. The dark lockup carries a baked-in plate rather than transparency, which is invisible
    // here only because that plate is within two levels of this background; changing either means
    // checking both.
    // Push. The icon is monochrome by design on Android, where the system paints it; iOS uses the
    // app icon and ignores this. No sounds bundled: the default is what people expect and a custom
    // one is a thing to get wrong.
    ["expo-notifications", { icon: "./assets/icon-bell.png", color: "#6D46F2" }],
    ["expo-splash-screen", { image: "./assets/brand/lockup-dark.png", imageWidth: 220, backgroundColor: "#0E0F14", dark: { backgroundColor: "#0E0F14" } }],
  ],
};

export default config;
