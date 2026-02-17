import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
