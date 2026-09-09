#!/usr/bin/env node
// Makes the client secret Supabase asks for under "Secret Key (for OAuth)".
//
// Apple does not accept the .p8 file as a secret. The .p8 is the *signing key*; the secret is a
// short-lived JWT signed with it, and Supabase's field wants that JWT. Apple caps its life at six
// months, so this has to be run again before it expires or Sign in with Apple simply stops working
// one morning with no deploy to blame.
//
//   node scripts/apple-client-secret.mjs \
//     --key ~/path/AuthKey_ABCD123456.p8 \
//     --key-id ABCD123456 --team-id XYZ9876543 --services-id app.allkept.signin
//
// Prints the JWT and nothing else, so it can be piped or copied without picking up stray text.
// Nothing is written to disk and nothing is sent anywhere: the signing happens locally.
import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);

const required = ["key", "key-id", "team-id", "services-id"];
const missing = required.filter((r) => !args[r]);
if (missing.length) {
  console.error(`Missing: ${missing.map((m) => `--${m}`).join(" ")}\n`);
  console.error("  --key          path to the AuthKey_XXXXXXXXXX.p8 you downloaded from Apple");
  console.error("  --key-id       the 10-character Key ID shown beside that key");
  console.error("  --team-id      the 10-character Team ID, top right of the Apple portal");
  console.error("  --services-id  the Services ID, e.g. app.allkept.signin (NOT the bundle ID)");
  process.exit(1);
}

const b64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let pem;
try {
  pem = readFileSync(args.key.replace(/^~/, process.env.HOME ?? "~"), "utf8");
} catch {
  console.error(`Could not read ${args.key}`);
  process.exit(1);
}
if (!pem.includes("BEGIN PRIVATE KEY")) {
  console.error("That file does not look like a .p8 private key.");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
/** Apple's hard maximum. Anything longer is rejected outright. */
const SIX_MONTHS = 15_777_000;

const header = { alg: "ES256", kid: args["key-id"] };
const payload = {
  iss: args["team-id"],
  iat: now,
  exp: now + SIX_MONTHS,
  aud: "https://appleid.apple.com",
  // The Services ID for the browser flow. A bundle ID here is the usual reason Apple answers
  // invalid_client after everything else looks right.
  sub: args["services-id"],
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

const signer = createSign("SHA256");
signer.update(signingInput);
// JWT wants the raw r||s pair. Node signs ECDSA as DER by default, which Apple rejects without
// explaining why — this flag is the whole difference between working and "invalid_client".
const signature = signer.sign(
  { key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" },
  "base64",
);

process.stdout.write(
  `${signingInput}.${signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}\n`,
);
console.error(`\n(expires ${new Date((now + SIX_MONTHS) * 1000).toDateString()} — regenerate before then)`);
