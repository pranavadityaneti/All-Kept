import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("shared copies", () => {
  it("supabase/functions/_shared matches packages (run `npm run sync:shared` if this fails)", () => {
    expect(() => execFileSync("node", ["scripts/sync-shared.mjs", "--check"], { cwd: repoRoot, stdio: "pipe" })).not.toThrow();
  });
});
