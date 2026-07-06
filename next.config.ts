import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSV uploads from a busy trading month can exceed the 1MB default
      bodySizeLimit: "10mb",
    },
    // Reuse a page's client-side cache for 30s: hopping back to a
    // recently visited tab is instant instead of a server round-trip.
    // Mutations still refresh immediately via revalidatePath.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
