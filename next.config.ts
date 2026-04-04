import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // サーバーサイドの native モジュール（better-sqlite3 など）をバンドルしない
  serverExternalPackages: ['better-sqlite3', '@anthropic-ai/sdk'],
  output: 'standalone',
  // ファイルアップロード用にボディサイズ上限を引き上げ（デフォルト 10MB → 30MB）
  experimental: {
    proxyClientMaxBodySize: '30mb',
  },
};

export default nextConfig;
