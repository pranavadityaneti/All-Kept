// What counts as "the same native app" for over-the-air updates.
//
// The fingerprint is the runtime version: an update reaches a build only when their fingerprints
// match. Everything under `extra` in the app config is left out of it — the RevenueCat key,
// the EAS project id — because those come from each machine's environment: a build refused to
// start on 15 Sep 2026 because the laptop's .env held a Test Store key and EAS held none, and
// the two fingerprints disagreed over a value that changes nothing native.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["ExpoConfigExtraSection"],
};
