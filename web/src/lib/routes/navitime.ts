import type { RouteProvider, RouteQuery, RouteResult } from "./types";

/**
 * NAVITIME Route(totalnavi) via RapidAPI（電車・バス）。
 * 住所は NAVITIME Geocoding（/address?word=）で座標に変換してから経路検索する。
 * パラメータ・レスポンスは公式仕様（api-sdk.navitime.co.jp）で確認済み：
 *   /route_transit：start・goal は「緯度,経度」、goal_time / start_time は YYYY-MM-DDThh:mm:ss、
 *   総移動時間は items[].summary.move.time（分）／ /address：items[].coord.lat, lon
 * RapidAPI のホスト名は購読画面の値を環境変数で設定する。
 */
export class NavitimeTransitProvider implements RouteProvider {
  readonly name = "navitime";
  constructor(
    private apiKey: string,
    private routeHost: string,
    private geocodingHost: string,
  ) {}

  private headers(host: string) {
    return { "X-RapidAPI-Key": this.apiKey, "X-RapidAPI-Host": host };
  }

  private async geocode(address: string): Promise<string | null> {
    const url = new URL(`https://${this.geocodingHost}/address`);
    url.searchParams.set("word", address);
    url.searchParams.set("datum", "wgs84");
    const res = await fetch(url, { headers: this.headers(this.geocodingHost) });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { coord?: { lat: number; lon: number } }[] };
    const c = data.items?.[0]?.coord;
    return c ? `${c.lat},${c.lon}` : null;
  }

  async compute(q: RouteQuery): Promise<RouteResult> {
    try {
      const [from, to] = q.direction === "outbound" ? [q.origin, q.destination] : [q.destination, q.origin];
      const [start, goal] = await Promise.all([this.geocode(from), this.geocode(to)]);
      if (!start || !goal) return { ok: false, reason: "NOT_FOUND" };

      const url = new URL(`https://${this.routeHost}/route_transit`);
      url.searchParams.set("start", start);
      url.searchParams.set("goal", goal);
      url.searchParams.set("datum", "wgs84");
      url.searchParams.set("limit", "1");
      // 行きは到着時刻指定、帰りは出発時刻指定（JSTのローカル時刻）
      url.searchParams.set(q.direction === "outbound" ? "goal_time" : "start_time", toJstLocal(q.time));

      const res = await fetch(url, { headers: this.headers(this.routeHost) });
      if (!res.ok) {
        console.error("NAVITIME error", res.status, await res.text());
        return { ok: false, reason: "ERROR" };
      }
      const data = (await res.json()) as { items?: { summary?: { move?: { time?: number } } }[] };
      const minutes = data.items?.[0]?.summary?.move?.time;
      if (typeof minutes !== "number") return { ok: false, reason: "NOT_FOUND" };
      return { ok: true, minutes };
    } catch (e) {
      console.error("NAVITIME request failed", e);
      return { ok: false, reason: "ERROR" };
    }
  }
}

function toJstLocal(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 19);
}
