import { afterEach, describe, expect, it, vi } from "vitest";
import { transitProvider } from "@/lib/routes";
import { EkispertTransitProvider } from "@/lib/routes/ekispert";
import { GoogleRoutesProvider } from "@/lib/routes/google";
import { MockRouteProvider } from "@/lib/routes/mock";
import { NavitimeTransitProvider } from "@/lib/routes/navitime";

// 各 API の公式仕様に沿ったリクエストを送り、レスポンスを正しく読めるかを fetch を差し替えて確認する

type Call = { url: URL; init?: RequestInit };

function mockFetch(handler: (url: URL, init?: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      return new Response(JSON.stringify(handler(url, init)), { status: 200 });
    }),
  );
  return calls;
}

const arriveBy = new Date("2026-11-08T12:55:00+09:00");
const base = { origin: "東京都新宿区西新宿2-8-1", destination: "渋谷駅", time: arriveBy };

afterEach(() => vi.unstubAllGlobals());

describe("GoogleRoutesProvider", () => {
  it("Essentials 区分（TRAFFIC_UNAWARE・所要時間のみ）で問い合わせ、秒を分に切り上げる", async () => {
    const calls = mockFetch(() => ({ routes: [{ duration: "1501s" }] }));
    const r = await new GoogleRoutesProvider("KEY").compute({ ...base, mode: "DRIVE", direction: "outbound" });
    expect(r).toEqual({ ok: true, minutes: 26 });
    const { url, init } = calls[0];
    expect(url.toString()).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    const headers = init!.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toBe("routes.duration");
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      origin: { address: base.origin },
      destination: { address: base.destination },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    });
  });

  it("帰りは集合場所→起点。徒歩では routingPreference を付けない", async () => {
    const calls = mockFetch(() => ({ routes: [{ duration: "600s" }] }));
    await new GoogleRoutesProvider("KEY").compute({ ...base, mode: "WALK", direction: "return" });
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body.origin.address).toBe(base.destination);
    expect(body.destination.address).toBe(base.origin);
    expect(body.routingPreference).toBeUndefined();
  });

  it("経路がなければ NOT_FOUND", async () => {
    mockFetch(() => ({}));
    const r = await new GoogleRoutesProvider("KEY").compute({ ...base, mode: "DRIVE", direction: "outbound" });
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("NavitimeTransitProvider", () => {
  it("住所を座標に変換し、到着時刻指定で経路検索する", async () => {
    const calls = mockFetch((url) =>
      url.pathname === "/address"
        ? { items: [{ coord: { lat: url.searchParams.get("word") === "渋谷駅" ? 35.658 : 35.689, lon: 139.7 } }] }
        : { items: [{ summary: { move: { time: 31 } } }] },
    );
    const p = new NavitimeTransitProvider("KEY", "route.example", "geo.example");
    const r = await p.compute({ ...base, mode: "TRANSIT", direction: "outbound" });
    expect(r).toEqual({ ok: true, minutes: 31 });

    const route = calls.find((c) => c.url.pathname === "/route_transit")!;
    expect(route.url.host).toBe("route.example");
    expect(route.url.searchParams.get("start")).toBe("35.689,139.7");
    expect(route.url.searchParams.get("goal")).toBe("35.658,139.7");
    expect(route.url.searchParams.get("goal_time")).toBe("2026-11-08T12:55:00");
    expect(route.url.searchParams.get("start_time")).toBeNull();
    expect((route.init!.headers as Record<string, string>)["X-RapidAPI-Host"]).toBe("route.example");
    const geo = calls.find((c) => c.url.pathname === "/address")!;
    expect(geo.url.host).toBe("geo.example");
  });

  it("帰りは出発時刻指定", async () => {
    const calls = mockFetch((url) =>
      url.pathname === "/address" ? { items: [{ coord: { lat: 35, lon: 139 } }] } : { items: [{ summary: { move: { time: 5 } } }] },
    );
    await new NavitimeTransitProvider("KEY", "r", "g").compute({ ...base, mode: "TRANSIT", direction: "return" });
    const route = calls.find((c) => c.url.pathname === "/route_transit")!;
    expect(route.url.searchParams.get("start_time")).toBe("2026-11-08T12:55:00");
  });

  it("住所が見つからなければ NOT_FOUND", async () => {
    mockFetch(() => ({ items: [] }));
    const r = await new NavitimeTransitProvider("KEY", "r", "g").compute({ ...base, mode: "TRANSIT", direction: "outbound" });
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("EkispertTransitProvider", () => {
  it("住所を viaList に指定し、到着時刻指定で検索。複数経路のうち最短の合計時間を返す", async () => {
    const calls = mockFetch(() => ({
      ResultSet: {
        Course: [
          { Route: { timeOnBoard: "20", timeWalk: "12", timeOther: "3" } },
          { Route: { timeOnBoard: "18", timeWalk: "8", timeOther: "2" } },
        ],
      },
    }));
    const r = await new EkispertTransitProvider("KEY").compute({ ...base, mode: "TRANSIT", direction: "outbound" });
    expect(r).toEqual({ ok: true, minutes: 28 });
    const { url } = calls[0];
    expect(url.pathname).toBe("/v1/json/search/course/extreme");
    expect(url.searchParams.get("viaList")).toBe(`${base.origin}:${base.destination}`);
    expect(url.searchParams.get("date")).toBe("20261108");
    expect(url.searchParams.get("time")).toBe("1255");
    expect(url.searchParams.get("searchType")).toBe("arrival");
  });

  it("経路が1件のとき Course はオブジェクトでも読める。帰りは出発時刻指定", async () => {
    const calls = mockFetch(() => ({ ResultSet: { Course: { Route: { timeOnBoard: "7", timeWalk: "4", timeOther: "0" } } } }));
    const r = await new EkispertTransitProvider("KEY").compute({ ...base, mode: "TRANSIT", direction: "return" });
    expect(r).toEqual({ ok: true, minutes: 11 });
    expect(calls[0].url.searchParams.get("viaList")).toBe(`${base.destination}:${base.origin}`);
    expect(calls[0].url.searchParams.get("searchType")).toBe("departure");
  });
});

describe("transitProvider の選択", () => {
  it("TRANSIT_PROVIDER で選び、未指定ならキーのある方、どちらもなければモック", () => {
    expect(transitProvider({ EKISPERT_API_KEY: "e" })).toBeInstanceOf(EkispertTransitProvider);
    expect(transitProvider({ RAPIDAPI_KEY: "r", RAPIDAPI_NAVITIME_HOST: "h" })).toBeInstanceOf(NavitimeTransitProvider);
    expect(
      transitProvider({ TRANSIT_PROVIDER: "ekispert", EKISPERT_API_KEY: "e", RAPIDAPI_KEY: "r", RAPIDAPI_NAVITIME_HOST: "h" }),
    ).toBeInstanceOf(EkispertTransitProvider);
    expect(transitProvider({})).toBeInstanceOf(MockRouteProvider);
  });
});
