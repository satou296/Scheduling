import type { MailAttachment } from "./mail";

export type CalendarItem = {
  id: string;
  title: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
};

/** 20261108T040000Z 形式（UTC） */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545：1行75オクテットを超える行は折り返す（マルチバイト文字の途中では切らない） */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74; // 継続行は先頭の空白1文字ぶん短くする
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** 確定した予定の iCalendar（.ics）。カレンダー未連携のメンバーがワンタップで登録できるようにする */
export function buildIcs(item: CalendarItem, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scheduling//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${item.id}@scheduling`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(item.start)}`,
    `DTEND:${utcStamp(item.end)}`,
    `SUMMARY:${escapeText(item.title)}`,
    `LOCATION:${escapeText(item.location)}`,
    `DESCRIPTION:${escapeText(item.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsAttachment(item: CalendarItem): MailAttachment {
  return { filename: "event.ics", content: buildIcs(item), contentType: "text/calendar; charset=utf-8; method=PUBLISH" };
}

/** Googleカレンダーの「予定を追加」画面を開くURL（ログイン中の本人のカレンダーに登録される） */
export function googleCalendarAddUrl(item: CalendarItem): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", item.title);
  url.searchParams.set("dates", `${utcStamp(item.start)}/${utcStamp(item.end)}`);
  url.searchParams.set("location", item.location);
  url.searchParams.set("details", item.description);
  return url.toString();
}
