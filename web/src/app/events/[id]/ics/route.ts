import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildIcs } from "@/lib/ics";
import { getCurrentUser } from "@/lib/session";

// 確定した予定の .ics をダウンロードする（メンバーのみ）
export async function GET(_req: Request, ctx: RouteContext<"/events/[id]/ics">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const event = await prisma.event.findUnique({
    where: { id },
    include: { slots: true, members: { where: { userId: user.id } } },
  });
  const slot = event?.slots.find((s) => s.id === event.confirmedSlotId);
  if (!event || event.members.length === 0 || !slot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ics = buildIcs({
    id: event.id,
    title: event.title,
    location: event.meetingPlace,
    description: `${process.env.APP_URL}/events/${event.id}`,
    start: slot.start,
    end: slot.end,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="event.ics"',
    },
  });
}
