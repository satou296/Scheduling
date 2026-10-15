import type { RouteProvider, RouteQuery, RouteResult } from "./types";

type EkispertRoute = { timeOnBoard?: string; timeWalk?: string; timeOther?: string };
type EkispertCourse = { Route?: EkispertRoute };

/**
 * 駅すぱあと API（経路探索 /v1/json/search/course/extreme）。電車・バスの代替プロバイダ。
 * viaList には住所をそのまま「出発地:到着地」で指定できる（公式リファレンスの例：「東京都杉並区高円寺北2-3-17:25853」）。
 * 所要時間は Route の timeOnBoard + timeWalk + timeOther（いずれも分・文字列）。
 */
export class EkispertTransitProvider implements RouteProvider {
  readonly name = "ekispert";
  constructor(private apiKey: string) {}

  async compute(q: RouteQuery): Promise<RouteResult> {
    const [from, to] = q.direction === "outbound" ? [q.origin, q.destination] : [q.destination, q.origin];
    const { date, time } = jstDateTime(q.time);
    const url = new URL("https://api.ekispert.jp/v1/json/search/course/extreme");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("viaList", `${from}:${to}`);
    url.searchParams.set("date", date);
    url.searchParams.set("time", time);
    // 行きは到着時刻指定、帰りは出発時刻指定
    url.searchParams.set("searchType", q.direction === "outbound" ? "arrival" : "departure");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error("Ekispert error", res.status, await res.text());
        return { ok: false, reason: "ERROR" };
      }
      const data = (await res.json()) as { ResultSet?: { Course?: EkispertCourse | EkispertCourse[] } };
      const raw = data.ResultSet?.Course;
      const courses = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const totals = courses
        .map((c) => c.Route)
        .filter((r): r is EkispertRoute => Boolean(r))
        .map((r) => Number(r.timeOnBoard ?? 0) + Number(r.timeWalk ?? 0) + Number(r.timeOther ?? 0))
        .filter((n) => Number.isFinite(n));
      if (totals.length === 0) return { ok: false, reason: "NOT_FOUND" };
      return { ok: true, minutes: Math.min(...totals) };
    } catch (e) {
      console.error("Ekispert request failed", e);
      return { ok: false, reason: "ERROR" };
    }
  }
}

/** 日本時間の YYYYMMDD と HHMM */
function jstDateTime(d: Date): { date: string; time: string } {
  const iso = new Date(d.getTime() + 9 * 3600_000).toISOString();
  return { date: iso.slice(0, 10).replace(/-/g, ""), time: iso.slice(11, 16).replace(":", "") };
}
