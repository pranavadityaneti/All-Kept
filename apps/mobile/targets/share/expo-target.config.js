/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "share",
  name: "AllkeptShare",
  displayName: "Allkept", // what the share sheet shows; defaults to the target name otherwise
  bundleIdentifier: ".share",
  deploymentTarget: "15.1",
  // The app icon, for the card's mark; becomes an imageset named "icon" in the extension's asset catalog.
  images: { icon: "../../assets/icon.png" },
  entitlements: {
    "com.apple.security.application-groups": ["group.app.allkept.mobile"],
  },
};
