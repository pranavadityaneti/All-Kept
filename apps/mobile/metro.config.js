// Expo's default config already resolves a monorepo; the workspace root is added so changes in
// packages/* reload without a restart.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../..")];

module.exports = config;
