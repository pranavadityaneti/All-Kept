import { defineConfig } from "vitest/config";

// Pure logic only: anything that touches React Native is verified on the simulator.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], environment: "node" } });
