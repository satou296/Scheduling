import { prisma } from "./db";

/** 判定結果画面用のデータ。他メンバーの予定の内容は含めず、参加可否だけを返す */
export async function loadEventView(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organizer: true,
      slots: true,
      members: {
        include: { user: true, results: true, answers: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!event) return null;
  const me = event.members.find((m) => m.userId === userId);
  if (!me) return null;

  const slots = event.slots
    .filter((s) => s.round === event.round)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const slotIds = new Set(slots.map((s) => s.id));

  const members = event.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    isOrganizer: m.role === "ORGANIZER",
    calendarLinked: m.user.calendarLinked,
    attendance: m.attendance,
    answered: slots.every((s) => m.answers.some((a) => a.slotId === s.id)),
    results: m.results.filter((r) => slotIds.has(r.slotId)),
  }));
  const judgedMembers = members.filter((m) => m.results.some((r) => !r.lateJoin));
  const lateMembers = members.filter((m) => m.results.length > 0 && m.results.every((r) => r.lateJoin));

  const summaries = slots.map((s) => {
    const available = judgedMembers.filter((m) => m.results.find((r) => r.slotId === s.id)?.available).length;
    return {
      slot: s,
      available,
      total: judgedMembers.length,
      allOk: judgedMembers.length > 0 && available === judgedMembers.length,
    };
  });

  return {
    event,
    me,
    isOrganizer: event.organizerId === userId,
    slots,
    members,
    judgedMembers,
    lateMembers,
    summaries,
    myAnswers: Object.fromEntries(me.answers.map((a) => [a.slotId, a.available])),
    confirmedSlot: event.slots.find((s) => s.id === event.confirmedSlotId),
  };
}

export type EventView = NonNullable<Awaited<ReturnType<typeof loadEventView>>>;
