import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // サーバーサイドの native モジュール（better-sqlite3 など）をバンドルしない
  serverExternalPackages: ['better-sqlite3', '@anthropic-ai/sdk'],
  output: 'standalone',
};

export default nextConfig;
