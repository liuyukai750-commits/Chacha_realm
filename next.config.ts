import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel supplies its own Next.js output tracing. Tencent Cloud needs the
  // standalone bundle only when we build outside Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
