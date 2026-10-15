// 表示・入力はすべて日本時間（Asia/Tokyo）で扱う
export const TZ = "Asia/Tokyo";
const JST_OFFSET = "+09:00";

/** <input type="datetime-local"> の値（JST）を Date に変換 */
export function parseJstLocal(value: string): Date {
  const d = new Date(`${value}:00${JST_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${value}`);
  return d;
}

/** 日付 "YYYY-MM-DD" と時刻 "HH:mm"（JST）から Date を作る */
export function parseJstDateTime(date: string, time: string): Date {
  return parseJstLocal(`${date}T${time}`);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatSlot(start: Date, end: Date): string {
  return `${formatDateTime(start)}〜${formatTime(end)}`;
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function monthKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}
