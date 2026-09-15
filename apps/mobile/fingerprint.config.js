// What counts as "the same native app" for over-the-air updates.
//
// The fingerprint is the runtime version: an update reaches a build only when their fingerprints
// match, so it must count only what changes the native app. Two things that do not are left out:
// - everything under `extra` in the app config — the RevenueCat key, the EAS project id — since
//   those come from each machine's environment: a build refused to start on 15 Sep 2026 because
//   the laptop's .env held a Test Store key and EAS held none;
// - the scripts in package.json — EAS's prebuild rewrites "expo start --ios" to "expo run:ios"
//   on the build machine, and the next build refused for that, over a line no app ever runs.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["ExpoConfigExtraSection", "PackageJsonScriptsAll"],
};
