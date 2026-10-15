import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { CALENDAR_SCOPES, oauthClient } from "@/lib/google-oauth";
import { safeNext, setSession, unsign } from "@/lib/session";

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL!;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = unsign(req.cookies.get("oauth_state")?.value);
  if (!code || !state || saved !== state) {
    return NextResponse.redirect(`${appUrl}/login?error=state`);
  }
  const { next, calendar } = JSON.parse(Buffer.from(state, "base64url").toString()) as {
    next: string;
    calendar: boolean;
  };

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) return NextResponse.redirect(`${appUrl}/login?error=profile`);

  const granted = (tokens.scope ?? "").split(" ");
  const calendarGranted = calendar && CALENDAR_SCOPES.every((s) => granted.includes(s));
  const tokenData = calendarGranted
    ? {
        calendarLinked: true,
        accessToken: tokens.access_token ?? null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      }
    : {};

  const existing = await prisma.user.findFirst({ where: { OR: [{ googleSub: p.sub }, { email: p.email }] } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { googleSub: p.sub, name: p.name ?? existing.name, image: p.picture ?? null, ...tokenData },
      })
    : await prisma.user.create({
        data: { googleSub: p.sub, email: p.email, name: p.name ?? p.email, image: p.picture ?? null, ...tokenData },
      });

  await setSession(user.id);
  let dest = safeNext(next);
  if (calendar && !calendarGranted) dest += `${dest.includes("?") ? "&" : "?"}calendar=denied`;
  const res = NextResponse.redirect(
    `${appUrl}${user.onboarded ? dest : `/onboarding?next=${encodeURIComponent(dest)}`}`,
  );
  res.cookies.delete("oauth_state");
  return res;
}
