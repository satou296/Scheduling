import { describe, expect, it } from "vitest";
import { decide, earliestSlot, isFree, summarize, travelWindow } from "@/lib/judge";

const t = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00+09:00`);

describe("travelWindow", () => {
  it("出発 = 開始 − 5分 − 行き、帰着 = 終了 + 帰り", () => {
    const w = travelWindow({ start: t("13:00"), end: t("17:00") }, 40, 30);
    expect(w.start).toEqual(t("12:15"));
    expect(w.end).toEqual(t("17:30"));
  });
});

describe("isFree", () => {
  const window = { start: t("12:15"), end: t("17:30") };
  it("移動時間内に予定があれば不可", () => {
    expect(isFree(window, [{ start: t("12:00"), end: t("12:20") }])).toBe(false);
    expect(isFree(window, [{ start: t("17:20"), end: t("18:00") }])).toBe(false);
  });
  it("境界がちょうど接しているだけなら可", () => {
    expect(isFree(window, [{ start: t("11:00"), end: t("12:15") }])).toBe(true);
    expect(isFree(window, [{ start: t("17:30"), end: t("19:00") }])).toBe(true);
  });
});

describe("decide", () => {
  const slots = [
    { id: "a", start: t("10:00"), end: t("12:00") },
    { id: "b", start: t("13:00"), end: t("15:00") },
    { id: "c", start: t("16:00"), end: t("18:00") },
  ];
  const r = (slotId: string, memberId: string, available: boolean) => ({ slotId, memberId, available });

  it("全員OKが1つなら自動確定", () => {
    const s = summarize(slots, ["x", "y"], [r("a", "x", true), r("a", "y", false), r("b", "x", true), r("b", "y", true)]);
    expect(decide(s)).toEqual({ kind: "CONFIRM", slotId: "b" });
  });

  it("全員OKが複数なら主催者が選択（早い順）", () => {
    const s = summarize(slots, ["x"], [r("c", "x", true), r("a", "x", true)]);
    expect(decide(s)).toEqual({ kind: "CHOOSE", slotIds: ["a", "c"] });
  });

  it("全員OKがなければ参加人数の多い順", () => {
    const s = summarize(slots, ["x", "y", "z"], [r("c", "x", true), r("c", "y", true), r("a", "z", true)]);
    const d = decide(s);
    expect(d.kind).toBe("FALLBACK");
    if (d.kind === "FALLBACK") expect(d.ranked.map((x) => x.slotId)).toEqual(["c", "a", "b"]);
  });

  it("earliestSlot は最も早い枠", () => {
    expect(earliestSlot([slots[2], slots[0], slots[1]])?.id).toBe("a");
  });
});
