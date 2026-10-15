import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    env: { DATABASE_URL: "file:./test.db", APP_URL: "http://localhost:3000", SESSION_SECRET: "test" },
    globalSetup: "./tests/global-setup.ts",
    fileParallelism: false,
  },
});
