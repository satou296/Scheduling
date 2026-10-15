// SESSION_SECRET（セッションCookieの署名鍵）の検査と生成。
// Next.js にも Prisma にも依存しないので、ログイン画面・セッション処理・セットアップスクリプトから共通で使う。
import { randomBytes } from "node:crypto";

/** .env.example に書いてある初期値。このままでは誰でも署名を偽造できるので使わせない */
export const PLACEHOLDER_SESSION_SECRET = "change-me";

export const SESSION_SECRET_FIX =
  "web/ で `npm run env:init` を実行するか、web/.env の SESSION_SECRET に `openssl rand -hex 32` で作った値を設定してください。";

/** 設定に問題があればその内容を返す。問題なければ null */
export function sessionSecretProblem(value: string | undefined): string | null {
  if (!value) return "SESSION_SECRET が設定されていません。";
  if (value === PLACEHOLDER_SESSION_SECRET) {
    return `SESSION_SECRET が .env.example の初期値（${PLACEHOLDER_SESSION_SECRET}）のままです。`;
  }
  return null;
}

export function generateSessionSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * .env の内容の SESSION_SECRET が未設定・初期値なら、新しい値に置き換えた内容を返す。
 * すでに有効な値が入っていれば変更しない（ログイン中のセッションを無効にしないため）。
 */
export function ensureSessionSecret(envText: string, newSecret: string): { text: string; changed: boolean } {
  const line = /^SESSION_SECRET=(.*)$/m;
  const m = envText.match(line);
  const current = m?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (m && !sessionSecretProblem(current)) return { text: envText, changed: false };
  const entry = `SESSION_SECRET="${newSecret}"`;
  if (m) return { text: envText.replace(line, entry), changed: true };
  const sep = envText === "" || envText.endsWith("\n") ? "" : "\n";
  return { text: `${envText}${sep}${entry}\n`, changed: true };
}
