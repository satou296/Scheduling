import type { RouteProvider, RouteQuery, RouteResult } from "./types";

const BASE: Record<RouteQuery["mode"], [number, number]> = {
  TRANSIT: [15, 75],
  DRIVE: [10, 60],
  WALK: [10, 120],
  BICYCLE: [10, 80],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** APIキー未設定時に使う疑似プロバイダ。住所の組み合わせから一定の所要時間を返す */
export class MockRouteProvider implements RouteProvider {
  readonly name = "mock";
  async compute(q: RouteQuery): Promise<RouteResult> {
    if (q.origin.trim() === q.destination.trim()) return { ok: true, minutes: 0 };
    const [min, max] = BASE[q.mode];
    const pair = [q.origin.trim(), q.destination.trim()].sort().join("|");
    return { ok: true, minutes: min + (hash(pair) % (max - min + 1)) };
  }
}
