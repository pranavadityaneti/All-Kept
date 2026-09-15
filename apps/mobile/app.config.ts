import type { ExpoConfig } from "expo/config";

/**
 * RevenueCat's *public* SDK keys. A Test Store key (test_…) drives a pretend store and must never
 * ship: a store build or an over-the-air bundle is exported with NODE_ENV=production, and refusing
 * the key there means a stray line in a local .env cannot reach anyone's phone. The development
 * key lives in .env.development, which only a development build reads.
 */
const revenuecatKey = (name: string): string => {
  const key = process.env[name] ?? "";
  if (process.env.NODE_ENV === "production" && key.startsWith("test_")) {
    throw new Error(`${name} is a RevenueCat Test Store key; a production build or update may not carry it.`);
  }
  return key;
};

/** Identifiers are fixed in the Phase 0 spec: display name Allkept, bundle id and package app.allkept.mobile, scheme allkept. */
// An Android build without the maps key builds clean and draws a blank map; said here, where the build log shows it.
if (process.env["EAS_BUILD_PLATFORM"] === "android" && !process.env["GOOGLE_MAPS_ANDROID_KEY"]) {
  console.warn("GOOGLE_MAPS_ANDROID_KEY is not set: the map of saved places will draw blank on Android.");
}

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
    // comgooglemaps: so a venue can be offered to Google Maps when it is installed; canOpenURL says nothing about a scheme not listed here.
    infoPlist: { ITSAppUsesNonExemptEncryption: false, LSApplicationQueriesSchemes: ["comgooglemaps"] },
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
    // The map of saved places is Google's on Android, and Google wants a key in the manifest. It is
    // restricted to this package in Google Cloud and ships inside the APK regardless, but it comes
    // from the build's environment (an EAS variable, or .env locally), not from this file. Absent,
    // the app builds and the map view draws blank, so an Android build without it is warned about.
    ...(process.env["GOOGLE_MAPS_ANDROID_KEY"] ? { config: { googleMaps: { apiKey: process.env["GOOGLE_MAPS_ANDROID_KEY"] } } } : {}),
  },
  // The EAS project Pranav created on 8 Sep 2026. Builds and over-the-air updates resolve through it.
  extra: {
    eas: { projectId: "55c2d8b3-2f30-462b-b052-2a685de0aa54" },
    // RevenueCat's *public* SDK keys — safe in the app; the secret key never leaves the dashboard.
    // Empty until Pranav creates the project; the app cannot sell until they are set.
    revenuecat: { ios: revenuecatKey("EXPO_PUBLIC_REVENUECAT_IOS"), android: revenuecatKey("EXPO_PUBLIC_REVENUECAT_ANDROID") },
  },
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
    // Where you are, only while the app is open, only when you ask: how far the places you saved
    // are, and which of them are near. No Always permission — the strings for it are removed, so the
    // build carries no claim it does not use — and no motion.
    ["expo-location", {
      locationWhenInUsePermission: "Allkept uses your location, only while you use the app, to show how far away the places you saved are.",
      locationAlwaysAndWhenInUsePermission: false, locationAlwaysPermission: false, motionUsagePermission: false,
    }],
    // The share sheet is served by our own extension (targets/share) and Android share activity
    // (modules/share-save); expo-sharing stays only for sharing *out*.
    "@bacons/apple-targets",
    // Android: "Save to Allkept" in the direct-share row (see modules/share-save/android/src/main/res/xml/shortcuts.xml).
    "./plugins/with-share-shortcuts",
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
