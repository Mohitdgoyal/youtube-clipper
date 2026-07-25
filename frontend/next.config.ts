import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimisticClientCache: true,
    optimizePackageImports: ["motion"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
