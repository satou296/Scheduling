import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

// 主要ブラウザ（スマホ表示を含む）で、調整の作成から確定までの流れを確認する（非機能要件：対応環境）
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // SQLite を共有するため直列に実行
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE_URL, locale: "ja-JP", timezoneId: "Asia/Tokyo", trace: "retain-on-failure" },
  projects: [
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-safari", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // E2E 専用の SQLite を作り直してから起動する（開発用DBには触れない）
    command: `rm -f prisma/e2e.db prisma/e2e.db-journal && npx prisma db push --skip-generate && npx next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: "file:./e2e.db",
      APP_URL: BASE_URL,
      SESSION_SECRET: "e2e-only-secret",
      DEV_LOGIN: "true",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_ROUTES_API_KEY: "",
      RAPIDAPI_KEY: "",
      EKISPERT_API_KEY: "",
      SMTP_HOST: "",
    },
  },
});
