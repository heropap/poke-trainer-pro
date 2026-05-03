import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      new URL("https://images.pokemontcg.io/**"),
    ],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [150, 245, 300, 400, 734],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
