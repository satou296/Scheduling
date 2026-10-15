// 日付を「年・月・日」の3つの欄で入力するための純粋関数（DateFields から使う）

export type DateParts = { y: string; m: string; d: string };
export type DatePart = keyof DateParts;

export const EMPTY_DATE_PARTS: DateParts = { y: "", m: "", d: "" };

/** 各欄の桁数。この桁数を入力したら次の欄へ移る（日は最後の欄なので移らない） */
export const PART_LENGTH: Record<DatePart, number> = { y: 4, m: 2, d: 2 };

function digitsOf(value: string): string {
  return value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
}

/** 数字以外を取り除き、欄の桁数までに切り詰める（全角数字は半角にする） */
export function sanitizePart(part: DatePart, value: string): string {
  return digitsOf(value).slice(0, PART_LENGTH[part]);
}

/**
 * 欄の入力内容（raw）から新しい値を決める。caret は入力後のカーソル位置。
 * 桁数いっぱいの欄にさらに打ったときは、打った数字から入力し直す（ブラウザ標準の日付欄と同じ動き）。
 */
export function nextPartValue(part: DatePart, previous: string, raw: string, caret: number | null): string {
  const max = PART_LENGTH[part];
  if (digitsOf(raw).length <= max) return digitsOf(raw);
  const added = raw.length - previous.length;
  if (caret !== null && added > 0) {
    const inserted = digitsOf(raw.slice(Math.max(0, caret - added), caret));
    if (inserted) return inserted.slice(0, max);
  }
  return sanitizePart(part, raw);
}

/** 貼り付けた文字列が「2026-11-08」「2026/11/8」「2026年11月8日」「20261108」なら欄ごとに分ける */
export function parseDateText(text: string): DateParts | null {
  const half = text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = half.match(/^(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})日?$/) ?? half.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const parts = { y: m[1], m: padPart("m", m[2]), d: padPart("d", m[3]) };
  return toIsoDate(parts) ? parts : null;
}

/** 入力後に次の欄へ移るか：年は4桁、月は2桁を入力したとき */
export function shouldAdvance(part: DatePart, value: string): boolean {
  return part !== "d" && value.length === PART_LENGTH[part];
}

/** 欄ごとの入力ミス。未入力（必須チェックはブラウザに任せる）や問題なしなら null */
export function partError(part: DatePart, parts: DateParts): string | null {
  const v = parts[part];
  if (!v) return null;
  if (part === "y") return v.length === 4 ? null : "年は西暦4桁で入力してください";
  const n = Number(v);
  if (part === "m") return n >= 1 && n <= 12 ? null : "月は1〜12で入力してください";
  if (n < 1 || n > 31) return "日は1〜31で入力してください";
  if (!partError("y", parts) && !partError("m", parts) && parts.y && parts.m && !toIsoDate(parts)) {
    return "存在しない日付です";
  }
  return null;
}

/** 実在する日付なら "YYYY-MM-DD"、未完成・不正なら null */
export function toIsoDate({ y, m, d }: DateParts): string | null {
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function fromIsoDate(iso: string): DateParts {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: m[1], m: m[2], d: m[3] } : EMPTY_DATE_PARTS;
}

/** 欄から離れたとき、1桁の月・日を "01" のように2桁にそろえる */
export function padPart(part: DatePart, value: string): string {
  return part !== "y" && /^[1-9]$/.test(value) ? `0${value}` : value;
}
