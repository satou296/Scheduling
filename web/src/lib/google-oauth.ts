import type { User } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "./db";
import { sendMail } from "./mail";

export const LOGIN_SCOPES = ["openid", "email", "profile"];
// 自分が所有するカレンダーの予定だけを対象にする権限。
// 予定の日時の取得（内容は取得しない：calendar.ts の EVENT_FIELDS）と、確定した予定の書き込みに使う
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events.owned"];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function oauthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/auth/google/callback`,
  });
}

/** Google が「このリフレッシュトークンはもう使えない」と返したか（権限の取り消し、テスト状態の7日の期限、6か月未使用など） */
export function isInvalidGrant(e: unknown): boolean {
  const data = (e as { response?: { data?: { error?: unknown } } })?.response?.data;
  return data?.error === "invalid_grant" || (e instanceof Error && e.message.includes("invalid_grant"));
}

/** 連携が切れたユーザーを未連携に戻し、連携し直すよう本人に知らせる */
async function markCalendarUnlinked(user: User) {
  const updated = await prisma.user.updateMany({
    where: { id: user.id, calendarLinked: true },
    data: { calendarLinked: false, accessToken: null, refreshToken: null, tokenExpiresAt: null },
  });
  // 同時に複数の処理が気づいても、知らせるのは1回だけ
  if (updated.count === 0 || !user.notifyEmail) return;
  await sendMail(
    user.email,
    "Googleカレンダーの連携が切れました",
    "Googleカレンダーの連携が切れたため、予定の空き状況を確認できなくなりました。\n" +
      "連携し直すまでは、調整ごとに候補の〇×を入力してください（入力のない候補は「不可」として判定します）。\n\n" +
      `連携し直す：${process.env.APP_URL}/settings`,
  );
}

/**
 * 保存済みトークンからアクセストークンを取得（期限切れなら更新して保存）。
 * 取得できないときは null を返し、例外は投げない（判定や確定の処理を止めないため）
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.refreshToken && !user?.accessToken) return null;
  if (user.accessToken && user.tokenExpiresAt && user.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return user.accessToken;
  }
  if (!user.refreshToken) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: user.refreshToken });
  let token: string | null | undefined;
  try {
    ({ token } = await client.getAccessToken());
  } catch (e) {
    if (isInvalidGrant(e)) {
      await markCalendarUnlinked(user);
    } else {
      console.error("refresh access token failed", userId, e);
    }
    return null;
  }
  const expiry = client.credentials.expiry_date;
  await prisma.user.update({
    where: { id: userId },
    data: { accessToken: token ?? null, tokenExpiresAt: expiry ? new Date(expiry) : null },
  });
  return token ?? null;
}
