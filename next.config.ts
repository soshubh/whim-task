import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/get-started",
        permanent: true,
      },
      {
        source: "/signup",
        destination: "/get-started",
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
