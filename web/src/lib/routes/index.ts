import { prisma } from "../db";
import { sendDeveloperAlert } from "../mail";
import { monthKey, TZ } from "../time";
import { GoogleRoutesProvider } from "./google";
import { MockRouteProvider } from "./mock";
import { NavitimeTransitProvider } from "./navitime";
import type { RouteProvider, RouteQuery, RouteResult } from "./types";

/** Google Routes API の月間無料枠（10,000件）に対するアプリ側の上限 */
export const GOOGLE_MONTHLY_LIMIT = 9_500;
export const GOOGLE_WARN_AT = 7_600;
const CACHE_TTL_MS = 30 * 24 * 3600_000;

function providerFor(mode: RouteQuery["mode"]): RouteProvider {
  if (mode === "TRANSIT") {
    const key = process.env.RAPIDAPI_KEY;
    const host = process.env.RAPIDAPI_NAVITIME_HOST;
    return key && host ? new NavitimeTransitProvider(key, host) : new MockRouteProvider();
  }
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  return key ? new GoogleRoutesProvider(key) : new MockRouteProvider();
}

/** 同じ起点・集合場所・移動手段・方向・時間帯（平日/休日×時）の結果を使い回すためのキー */
export function cacheKey(q: RouteQuery): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(q.time);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = parts.find((p) => p.type === "hour")!.value;
  const dayType = weekday === "Sat" || weekday === "Sun" ? "holiday" : "weekday";
  return [q.origin.trim(), q.destination.trim(), q.mode, q.direction, dayType, hour].join("|");
}

/**
 * Google Routes の利用回数を1件予約する。上限に達していれば false。
 * 80% 到達時と上限到達時に開発者へ1回だけ通知する。
 */
export async function reserveGoogleQuota(now = new Date()): Promise<boolean> {
  const month = monthKey(now);
  const usage = await prisma.apiUsage.upsert({
    where: { provider_month: { provider: "google-routes", month } },
    create: { provider: "google-routes", month },
    update: {},
  });
  if (usage.count >= GOOGLE_MONTHLY_LIMIT) {
    if (!usage.stoppedAt) {
      await prisma.apiUsage.update({ where: { id: usage.id }, data: { stoppedAt: now } });
      await sendDeveloperAlert(
        "【要確認】Google Routes API の月間上限に達しました",
        `${month} の呼び出し回数が ${GOOGLE_MONTHLY_LIMIT} 件に達したため、呼び出しを停止しました。\n以降の判定は移動時間を考慮せず、カレンダーの空きだけで行います。`,
      );
    }
    return false;
  }
  const updated = await prisma.apiUsage.update({
    where: { id: usage.id },
    data: { count: { increment: 1 } },
  });
  if (updated.count >= GOOGLE_WARN_AT && !updated.warnedAt) {
    await prisma.apiUsage.update({ where: { id: usage.id }, data: { warnedAt: now } });
    await sendDeveloperAlert(
      "Google Routes API の利用が月間上限の80%に達しました",
      `${month} の呼び出し回数が ${updated.count} 件になりました（アプリ側上限 ${GOOGLE_MONTHLY_LIMIT} 件）。`,
    );
  }
  return true;
}

export async function getTravelMinutes(q: RouteQuery): Promise<RouteResult> {
  const key = cacheKey(q);
  const cached = await prisma.routeCache.findUnique({ where: { key } });
  if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
    return { ok: true, minutes: cached.minutes };
  }

  const provider = providerFor(q.mode);
  if (provider instanceof GoogleRoutesProvider && !(await reserveGoogleQuota())) {
    return { ok: false, reason: "QUOTA" };
  }
  const result = await provider.compute(q);
  if (result.ok) {
    await prisma.routeCache.upsert({
      where: { key },
      create: { key, minutes: result.minutes },
      update: { minutes: result.minutes, createdAt: new Date() },
    });
  }
  return result;
}

export type { RouteQuery, RouteResult, TravelMode } from "./types";
