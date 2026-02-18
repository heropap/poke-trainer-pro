import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: '/battle/page',
        destination: '/battle',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
