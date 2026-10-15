import { prisma } from "./db";
import { getAccessToken } from "./google-oauth";

export type Interval = { start: Date; end: Date };

const API = "https://www.googleapis.com/calendar/v3";

/**
 * 指定期間の「埋まり」区間だけを取得する（予定の内容は取得しない：FreeBusy API）。
 * 取得できない場合は null。
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
  const res = await fetch(`${API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  if (!res.ok) {
    console.error("freeBusy failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  };
  const cal = data.calendars?.primary;
  if (!cal || cal.errors?.length) return null;
  return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
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
}
