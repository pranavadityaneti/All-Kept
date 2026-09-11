import type { NextConfig } from "next";

// Five static pages and nothing to render on request. A static export makes that a build-time
// guarantee: any server-only feature would fail the build instead of quietly shipping.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
