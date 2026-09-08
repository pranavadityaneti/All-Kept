import { defineConfig } from "vitest/config";

// Pure logic only: anything that touches React Native is verified on the simulator.
// The workspace packages ship TypeScript source, so they must be transformed rather than
// treated as external modules, or the runner tries to parse .ts as .js.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    server: { deps: { inline: [/@allkept\//] } },
  },
});
