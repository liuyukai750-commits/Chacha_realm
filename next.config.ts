import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Vercel builds unchanged while also emitting the minimal Node.js
  // runtime used by the Tencent Cloud self-hosted release pipeline.
  output: "standalone",
};

export default nextConfig;
