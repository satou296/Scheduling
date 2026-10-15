import { describe, expect, it } from "vitest";
import {
  fromIsoDate,
  nextPartValue,
  padPart,
  parseDateText,
  partError,
  sanitizePart,
  shouldAdvance,
  toIsoDate,
} from "@/lib/date-parts";

describe("shouldAdvance", () => {
  it("年は4桁で次の欄へ移る", () => {
    expect(shouldAdvance("y", "202")).toBe(false);
    expect(shouldAdvance("y", "2026")).toBe(true);
  });

  it("月は2桁で次の欄へ移る", () => {
    expect(shouldAdvance("m", "1")).toBe(false);
    expect(shouldAdvance("m", "11")).toBe(true);
    expect(shouldAdvance("m", "03")).toBe(true);
  });

  it("日は最後の欄なので移らない", () => {
    expect(shouldAdvance("d", "08")).toBe(false);
  });
});

describe("sanitizePart", () => {
  it("数字以外を除き、桁数で切り詰める", () => {
    expect(sanitizePart("y", "2026年")).toBe("2026");
    expect(sanitizePart("y", "202611")).toBe("2026");
    expect(sanitizePart("m", "1a2")).toBe("12");
  });

  it("全角数字は半角にする", () => {
    expect(sanitizePart("y", "２０２６")).toBe("2026");
  });
});

describe("toIsoDate / fromIsoDate", () => {
  it("実在する日付を YYYY-MM-DD にする（1桁の月日は0埋め）", () => {
    expect(toIsoDate({ y: "2026", m: "11", d: "08" })).toBe("2026-11-08");
    expect(toIsoDate({ y: "2026", m: "3", d: "5" })).toBe("2026-03-05");
    expect(toIsoDate({ y: "2028", m: "02", d: "29" })).toBe("2028-02-29");
  });

  it("未完成・存在しない日付は null", () => {
    expect(toIsoDate({ y: "202", m: "11", d: "08" })).toBeNull();
    expect(toIsoDate({ y: "2026", m: "", d: "08" })).toBeNull();
    expect(toIsoDate({ y: "2026", m: "13", d: "01" })).toBeNull();
    expect(toIsoDate({ y: "2026", m: "02", d: "29" })).toBeNull();
    expect(toIsoDate({ y: "2026", m: "04", d: "31" })).toBeNull();
  });

  it("YYYY-MM-DD を欄ごとに分ける", () => {
    expect(fromIsoDate("2026-11-08")).toEqual({ y: "2026", m: "11", d: "08" });
    expect(fromIsoDate("")).toEqual({ y: "", m: "", d: "" });
  });
});

describe("partError", () => {
  it("未入力はブラウザの必須チェックに任せる", () => {
    expect(partError("y", { y: "", m: "", d: "" })).toBeNull();
  });

  it("桁不足・範囲外・存在しない日付を知らせる", () => {
    expect(partError("y", { y: "26", m: "", d: "" })).toMatch("4桁");
    expect(partError("m", { y: "2026", m: "13", d: "" })).toMatch("1〜12");
    expect(partError("m", { y: "2026", m: "00", d: "" })).toMatch("1〜12");
    expect(partError("d", { y: "2026", m: "11", d: "32" })).toMatch("1〜31");
    expect(partError("d", { y: "2026", m: "02", d: "30" })).toMatch("存在しない");
  });

  it("正しい日付なら null", () => {
    const parts = { y: "2026", m: "11", d: "08" };
    expect(partError("y", parts)).toBeNull();
    expect(partError("m", parts)).toBeNull();
    expect(partError("d", parts)).toBeNull();
  });
});

describe("padPart", () => {
  it("1桁の月・日を2桁にそろえ、年や0は変えない", () => {
    expect(padPart("m", "3")).toBe("03");
    expect(padPart("d", "12")).toBe("12");
    expect(padPart("m", "0")).toBe("0");
    expect(padPart("y", "2")).toBe("2");
  });
});

describe("nextPartValue", () => {
  it("桁数までは打った数字をそのまま使う", () => {
    expect(nextPartValue("y", "202", "2026", 4)).toBe("2026");
    expect(nextPartValue("m", "", "1", 1)).toBe("1");
  });

  it("桁数いっぱいの欄に打つと、打った数字から入力し直す", () => {
    // 「候補を追加」でコピーされた 2099 の末尾・先頭・途中に 2 を打った場合
    expect(nextPartValue("y", "2099", "20992", 5)).toBe("2");
    expect(nextPartValue("y", "2099", "22099", 1)).toBe("2");
    expect(nextPartValue("m", "11", "131", 2)).toBe("3");
  });

  it("長い数字を貼り付けたら桁数で切り詰める", () => {
    expect(nextPartValue("y", "", "202611", 6)).toBe("2026");
  });
});

describe("parseDateText", () => {
  it("よくある書き方の日付を欄ごとに分ける", () => {
    const expected = { y: "2026", m: "11", d: "08" };
    expect(parseDateText("2026-11-08")).toEqual(expected);
    expect(parseDateText("2026/11/8")).toEqual(expected);
    expect(parseDateText("2026年11月8日")).toEqual(expected);
    expect(parseDateText("20261108")).toEqual(expected);
    expect(parseDateText(" ２０２６/１１/０８ ")).toEqual(expected);
  });

  it("日付でない・存在しない日付は null", () => {
    expect(parseDateText("2026")).toBeNull();
    expect(parseDateText("2026-02-30")).toBeNull();
    expect(parseDateText("あした")).toBeNull();
  });
});
