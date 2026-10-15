import { OAuth2Client } from "google-auth-library";
import { prisma } from "./db";

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

/** 保存済みトークンからアクセストークンを取得（期限切れなら更新して保存） */
export async function getAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.refreshToken && !user?.accessToken) return null;
  if (user.accessToken && user.tokenExpiresAt && user.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return user.accessToken;
  }
  if (!user.refreshToken) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: user.refreshToken });
  const { token } = await client.getAccessToken();
  const expiry = client.credentials.expiry_date;
  await prisma.user.update({
    where: { id: userId },
    data: { accessToken: token ?? null, tokenExpiresAt: expiry ? new Date(expiry) : null },
  });
  return token ?? null;
}
