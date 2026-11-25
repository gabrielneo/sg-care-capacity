import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // "How it's built" was a page of links to pages already under Methods; one section, one hub.
  redirects: async () => [{ source: "/how-its-built", destination: "/methodology", permanent: true }],
};

export default nextConfig;
