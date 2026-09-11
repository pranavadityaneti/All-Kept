/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "share",
  name: "AllkeptShare",
  bundleIdentifier: ".share",
  deploymentTarget: "15.1",
  entitlements: {
    "com.apple.security.application-groups": ["group.app.allkept.mobile"],
  },
};
