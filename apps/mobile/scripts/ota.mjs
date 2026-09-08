#!/usr/bin/env node
// Publishes an over-the-air update. npm drops the quotes around a script argument, so every word
// after the branch is joined back into one message here.
import { execFileSync } from "node:child_process";

const [, , branch, ...rest] = process.argv;
if (!branch) {
  console.error("usage: node scripts/ota.mjs <branch> <message…>");
  process.exit(1);
}

const message = rest.filter((word) => word !== "--").join(" ").trim() || describeLastCommit();

function describeLastCommit() {
  try {
    return execFileSync("git", ["log", "-1", "--pretty=%s"], { encoding: "utf8" }).trim();
  } catch {
    return "update";
  }
}

console.log(`Publishing to "${branch}": ${message}`);
execFileSync(
  "npx",
  ["--yes", "eas-cli@latest", "update", "--branch", branch, "--environment", branch, "--message", message, "--non-interactive"],
  { stdio: "inherit" },
);
