import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@zepto/research-worker"],
  serverExternalPackages: ["csv-parse"],
};
export default nextConfig;
