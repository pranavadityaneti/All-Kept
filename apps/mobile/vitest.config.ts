import { defineConfig } from "vitest/config";

// Native modules are mocked in component tests; device-only behavior still needs a native build.
// The workspace packages ship TypeScript source, so they must be transformed rather than
// treated as external modules, or the runner tries to parse .ts as .js.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    server: { deps: { inline: [/@allkept\//] } },
  },
});
