import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal self-contained server bundle so the Docker image
  // doesn't need to carry the full node_modules tree at runtime.
  // Required by the staging Dockerfile; harmless for yarn dev.
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
