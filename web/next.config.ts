import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E テストでは開発サーバーと並行して動かせるよう、出力先を分ける
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/client", "nodemailer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
