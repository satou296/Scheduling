import { prisma } from "./db";
import { getAccessToken } from "./google-oauth";
import { TZ, startOfDayInZone } from "./time";

export type Interval = { start: Date; end: Date };

const API = "https://www.googleapis.com/calendar/v3";

/** events.list の予定のうち、判定に使う項目だけ（タイトル・説明・場所・参加者のメールなどは受け取らない） */
export type CalendarItem = {
  status?: string;
  transparency?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

// 予定の内容を取得しないよう、レスポンスに含める項目を日時・種類・自分の出欠に限定する
export const EVENT_FIELDS =
  "timeZone,nextPageToken,items(status,transparency,eventType,start(date,dateTime),end(date,dateTime),attendees(self,responseStatus))";

/** 予定ではなくカレンダーが自動で表示する項目（連絡先の誕生日・勤務場所）は埋まりにしない */
const NON_BLOCKING_EVENT_TYPES = new Set(["birthday", "workingLocation"]);

/**
 * 予定を「埋まり」区間に変換する（判定ロジック：予定は内容にかかわらずすべて不可）。
 * - 終日の予定も、「予定なし（空き時間として表示）」に設定された予定も埋まりとして扱う
 * - キャンセルされた予定、自分が「不参加」と回答した招待、誕生日・勤務場所の表示は除く
 * - 終日の予定の日付はカレンダーのタイムゾーンで解釈する（end.date は翌日＝その日を含まない）
 */
export function itemsToBusy(items: CalendarItem[], calendarTimeZone: string = TZ): Interval[] {
  const busy: Interval[] = [];
  for (const item of items) {
    if (item.status === "cancelled") continue;
    if (item.eventType && NON_BLOCKING_EVENT_TYPES.has(item.eventType)) continue;
    if (item.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const start = item.start?.dateTime
      ? new Date(item.start.dateTime)
      : item.start?.date
        ? startOfDayInZone(item.start.date, calendarTimeZone)
        : null;
    const end = item.end?.dateTime
      ? new Date(item.end.dateTime)
      : item.end?.date
        ? startOfDayInZone(item.end.date, calendarTimeZone)
        : null;
    if (start && end && end > start) busy.push({ start, end });
  }
  return busy;
}

/**
 * 指定期間の「埋まり」区間を取得する。取得できない場合は null。
 * Events API から日時だけを受け取り、予定の内容（タイトル・説明など）は取得しない。
 * FreeBusy API は終日の予定や「空き時間として表示」の予定を返さないため使わない。
 */
export async function getBusy(userId: string, timeMin: Date, timeMax: Date): Promise<Interval[] | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.calendarLinked) return null;

  if (user.isDevUser) {
    const events = await prisma.devCalendarEvent.findMany({
      where: { userId, start: { lt: timeMax }, end: { gt: timeMin } },
    });
    return events.map((e) => ({ start: e.start, end: e.end }));
  }

  const token = await getAccessToken(userId);
  if (!token) return null;

  const items: CalendarItem[] = [];
  let calendarTimeZone = TZ;
  let pageToken: string | undefined;
  // 通信エラーでも例外は投げず null を返す（呼び出し元は〇×の手入力で判定を続ける）
  try {
    do {
      const url = new URL(`${API}/calendars/primary/events`);
      url.searchParams.set("timeMin", timeMin.toISOString());
      url.searchParams.set("timeMax", timeMax.toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("fields", EVENT_FIELDS);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        console.error("events.list failed", res.status, await res.text());
        return null;
      }
      const data = (await res.json()) as { timeZone?: string; nextPageToken?: string; items?: CalendarItem[] };
      if (data.timeZone) calendarTimeZone = data.timeZone;
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (e) {
    console.error("events.list failed", e);
    return null;
  }

  return itemsToBusy(items, calendarTimeZone);
}

export type CalendarEventInput = {
  title: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
};

/** 確定した予定をメンバー本人のカレンダーに書き込む。作成した予定のIDを返す */
export async function insertEvent(userId: string, input: CalendarEventInput): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.calendarLinked) return null;

  if (user.isDevUser) {
    const e = await prisma.devCalendarEvent.create({
      data: { userId, title: input.title, start: input.start, end: input.end },
    });
    return e.id;
  }

  const token = await getAccessToken(userId);
  if (!token) return null;
  // 書き込めなかったときは null を返し、呼び出し元が .ics と追加リンクのメールに切り替える
  try {
    const res = await fetch(`${API}/calendars/primary/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.title,
        location: input.location,
        description: input.description,
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
      }),
    });
    if (!res.ok) {
      console.error("events.insert failed", res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { id: string }).id;
  } catch (e) {
    console.error("events.insert failed", e);
    return null;
  }
}
