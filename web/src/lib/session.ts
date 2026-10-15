import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_SECRET_FIX, sessionSecretProblem } from "./session-secret";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  const problem = sessionSecretProblem(s);
  if (problem || !s) throw new Error(`${problem} ${SESSION_SECRET_FIX}`);
  return s;
}

export function sign(value: string): string {
  const mac = createHmac("sha256", secret()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signed);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return value;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  const payload = `${userId}:${Date.now() + MAX_AGE * 1000}`;
  jar.set(COOKIE, sign(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser() {
  const value = unsign((await cookies()).get(COOKIE)?.value);
  if (!value) return null;
  const [userId, exp] = value.split(":");
  if (!userId || Number(exp) < Date.now()) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** ログイン必須。未ログインならログイン画面へ（ログイン後に戻るURLを付与） */
export async function requireUser(returnTo?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  return user;
}

export function devLoginEnabled(): boolean {
  return process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
}

/** オープンリダイレクト防止：アプリ内の相対パスのみ許可 */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/home";
}
