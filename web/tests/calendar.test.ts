import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_FIELDS, getBusy, itemsToBusy } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { startOfDayInZone } from "@/lib/time";

const iso = (s: string) => new Date(s).toISOString();

describe("startOfDayInZone", () => {
  it("日本時間の 0:00", () => {
    expect(startOfDayInZone("2026-11-08", "Asia/Tokyo").toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });
  it("夏時間のあるタイムゾーンでも正しい", () => {
    expect(startOfDayInZone("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfDayInZone("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("itemsToBusy", () => {
  it("終日の予定は、その日の 0:00〜翌日 0:00（カレンダーのタイムゾーン）を埋まりにする", () => {
    const busy = itemsToBusy([{ start: { date: "2026-11-08" }, end: { date: "2026-11-09" } }], "Asia/Tokyo");
    expect(busy.map((b) => [b.start.toISOString(), b.end.toISOString()])).toEqual([
      [iso("2026-11-08T00:00:00+09:00"), iso("2026-11-09T00:00:00+09:00")],
    ]);
  });

  it("複数日にわたる終日の予定", () => {
    const [b] = itemsToBusy([{ start: { date: "2026-11-07" }, end: { date: "2026-11-10" } }]);
    expect(b.start.toISOString()).toBe(iso("2026-11-07T00:00:00+09:00"));
    expect(b.end.toISOString()).toBe(iso("2026-11-10T00:00:00+09:00"));
  });

  it("「空き時間として表示」の予定や不在の予定も埋まりにする", () => {
    const busy = itemsToBusy([
      { transparency: "transparent", start: { dateTime: "2026-11-08T10:00:00+09:00" }, end: { dateTime: "2026-11-08T11:00:00+09:00" } },
      { eventType: "outOfOffice", start: { dateTime: "2026-11-08T12:00:00+09:00" }, end: { dateTime: "2026-11-08T18:00:00+09:00" } },
      { eventType: "fromGmail", start: { date: "2026-11-09" }, end: { date: "2026-11-10" } },
    ]);
    expect(busy).toHaveLength(3);
  });

  it("キャンセル済み・自分が不参加と回答した招待・誕生日・勤務場所は除く", () => {
    const allDay = { start: { date: "2026-11-08" }, end: { date: "2026-11-09" } };
    const busy = itemsToBusy([
      { ...allDay, status: "cancelled" },
      { ...allDay, attendees: [{ self: false, responseStatus: "accepted" }, { self: true, responseStatus: "declined" }] },
      { ...allDay, eventType: "birthday" },
      { ...allDay, eventType: "workingLocation" },
      { ...allDay, attendees: [{ self: true, responseStatus: "tentative" }] },
    ]);
    expect(busy).toHaveLength(1); // 「未定」と回答した招待だけが残る
  });
});

describe("getBusy（Google カレンダー）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("日時だけを要求し、ページを順に取得して終日の予定も埋まりに含める", async () => {
    const user = await prisma.user.create({
      data: {
        email: "calendar-test@example.com",
        name: "cal",
        calendarLinked: true,
        accessToken: "token",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        urls.push(url);
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
        const body = url.searchParams.get("pageToken")
          ? { timeZone: "Asia/Tokyo", items: [{ start: { date: "2026-11-08" }, end: { date: "2026-11-09" } }] }
          : {
              timeZone: "Asia/Tokyo",
              nextPageToken: "p2",
              items: [{ start: { dateTime: "2026-11-07T10:00:00+09:00" }, end: { dateTime: "2026-11-07T11:00:00+09:00" } }],
            };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const busy = await getBusy(user.id, new Date("2026-11-07T00:00:00+09:00"), new Date("2026-11-09T00:00:00+09:00"));
    expect(busy).toHaveLength(2);
    expect(urls).toHaveLength(2);
    const first = urls[0];
    expect(first.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(first.searchParams.get("singleEvents")).toBe("true");
    expect(first.searchParams.get("fields")).toBe(EVENT_FIELDS);
    // 予定の内容（タイトル・説明・場所・参加者のメール）を要求していない
    for (const field of ["summary", "description", "location", "email"]) {
      expect(EVENT_FIELDS).not.toContain(field);
    }
    expect(urls[1].searchParams.get("pageToken")).toBe("p2");
  });

  it("取得に失敗したら null", async () => {
    const user = await prisma.user.create({
      data: {
        email: "calendar-test-ng@example.com",
        name: "cal",
        calendarLinked: true,
        accessToken: "token",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getBusy(user.id, new Date(), new Date(Date.now() + 3600_000))).toBeNull();
  });
});
