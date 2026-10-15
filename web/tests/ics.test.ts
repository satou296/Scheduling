import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarAddUrl } from "@/lib/ics";

const item = {
  id: "evt1",
  title: "週末ボウリング, 打ち上げ; その後",
  location: "渋谷駅 ハチ公前",
  description: "https://example.com/events/evt1\n2行目",
  start: new Date("2026-11-08T13:00:00+09:00"),
  end: new Date("2026-11-08T16:00:00+09:00"),
};

describe("buildIcs", () => {
  const ics = buildIcs(item, new Date("2026-10-15T00:00:00Z"));

  it("UTCの日時と必須項目を含み、CRLFで改行する", () => {
    expect(ics).toContain("DTSTART:20261108T040000Z\r\n");
    expect(ics).toContain("DTEND:20261108T070000Z\r\n");
    expect(ics).toContain("UID:evt1@scheduling\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("カンマ・セミコロン・改行をエスケープする", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:週末ボウリング\\, 打ち上げ\; その後");
    expect(unfolded).toContain("\\n2行目");
  });

  it("1行75オクテット以内に折り返す", () => {
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("googleCalendarAddUrl", () => {
  it("予定追加画面のURLを作る", () => {
    const url = new URL(googleCalendarAddUrl(item));
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261108T040000Z/20261108T070000Z");
    expect(url.searchParams.get("text")).toBe(item.title);
  });
});
