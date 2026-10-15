import type { RouteProvider, RouteQuery, RouteResult } from "./types";

const MODE_MAP = { DRIVE: "DRIVE", WALK: "WALK", BICYCLE: "BICYCLE" } as const;

/**
 * Google Routes API（computeRoutes）。
 * 料金の安い Essentials 区分に収めるため、交通状況を考慮しない（TRAFFIC_UNAWARE）設定で、
 * 取得フィールドも所要時間だけに絞る。
 */
export class GoogleRoutesProvider implements RouteProvider {
  readonly name = "google-routes";
  constructor(private apiKey: string) {}

  async compute(q: RouteQuery): Promise<RouteResult> {
    if (q.mode === "TRANSIT") return { ok: false, reason: "ERROR" };
    const body: Record<string, unknown> = {
      origin: { address: q.direction === "outbound" ? q.origin : q.destination },
      destination: { address: q.direction === "outbound" ? q.destination : q.origin },
      travelMode: MODE_MAP[q.mode],
      languageCode: "ja",
      regionCode: "JP",
      units: "METRIC",
    };
    if (q.mode === "DRIVE") body.routingPreference = "TRAFFIC_UNAWARE";

    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "routes.duration",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error("Routes API error", res.status, await res.text());
        return { ok: false, reason: "ERROR" };
      }
      const data = (await res.json()) as { routes?: { duration?: string }[] };
      const duration = data.routes?.[0]?.duration;
      if (!duration) return { ok: false, reason: "NOT_FOUND" };
      return { ok: true, minutes: Math.ceil(parseInt(duration, 10) / 60) };
    } catch (e) {
      console.error("Routes API request failed", e);
      return { ok: false, reason: "ERROR" };
    }
  }
}
