import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // @group Configuration > Preview : Keep the development badge off sidebar controls
  devIndicators: false,
};

export default nextConfig;
