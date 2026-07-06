import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSV uploads from a busy trading month can exceed the 1MB default
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
