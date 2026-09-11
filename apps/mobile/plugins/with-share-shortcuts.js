const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Points Android at the share-target declaration in modules/share-save (res/xml/shortcuts.xml), so
 * "Save to Allkept" can appear in the share sheet's direct-share row. Android reads
 * android.app.shortcuts only from the launcher activity, which a library manifest cannot reach.
 */
module.exports = function withShareShortcuts(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const main = application?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
    if (!main) throw new Error("with-share-shortcuts: .MainActivity not found in AndroidManifest.xml");
    main["meta-data"] = (main["meta-data"] ?? []).filter((m) => m.$["android:name"] !== "android.app.shortcuts");
    main["meta-data"].push({ $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } });
    return config;
  });
};
