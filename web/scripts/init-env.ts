/**
 * 開発環境の .env を用意する。
 *   npm run env:init
 * .env がなければ .env.example から作り、SESSION_SECRET が未設定・初期値（change-me）ならランダムな値を入れる。
 * すでに設定済みの値や、API キーなどほかの項目は変更しない。
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureSessionSecret, generateSessionSecret } from "../src/lib/session-secret";

const root = join(__dirname, "..");
const envPath = join(root, ".env");

if (!existsSync(envPath)) {
  copyFileSync(join(root, ".env.example"), envPath);
  console.log(".env.example から .env を作成しました。");
}

const { text, changed } = ensureSessionSecret(readFileSync(envPath, "utf8"), generateSessionSecret());
if (changed) {
  writeFileSync(envPath, text);
  console.log("SESSION_SECRET にランダムな値を設定しました。");
} else {
  console.log("SESSION_SECRET は設定済みです（変更していません）。");
}
