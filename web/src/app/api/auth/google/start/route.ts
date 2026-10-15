import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CALENDAR_SCOPES, LOGIN_SCOPES, googleConfigured, oauthClient } from "@/lib/google-oauth";
import { safeNext, sign } from "@/lib/session";

// ?calendar=1 のときはカレンダー連携（FreeBusy＋予定の書き込み）の権限を追加で求める
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です" }, { status: 500 });
  }
  const calendar = req.nextUrl.searchParams.get("calendar") === "1";
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ nonce, next, calendar })).toString("base64url");

  const url = oauthClient().generateAuthUrl({
    scope: calendar ? [...LOGIN_SCOPES, ...CALENDAR_SCOPES] : LOGIN_SCOPES,
    access_type: calendar ? "offline" : "online",
    prompt: calendar ? "consent" : "select_account",
    include_granted_scopes: true,
    state,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", sign(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
