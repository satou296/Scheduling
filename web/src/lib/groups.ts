import { randomBytes } from "node:crypto";
import type { Event, Slot } from "@prisma/client";
import { prisma } from "./db";
import { handleLateJoin } from "./scheduler";

export function newInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

export function inviteUrl(token: string): string {
  return `${process.env.APP_URL}/invite/${token}`;
}

/**
 * グループに新しく参加した人が加わる調整。
 * 中止を除き、確定済みのものは予定がまだ終わっていないものだけ（F-15：確定済みでも参加可能なら追加）。
 */
export function isJoinable(event: Event & { slots: Slot[] }, now = new Date()): boolean {
  if (event.status === "CANCELLED") return false;
  if (event.status !== "CONFIRMED") return true;
  const slot = event.slots.find((s) => s.id === event.confirmedSlotId);
  return Boolean(slot && slot.end > now);
}

/** 〇×入力の対象となる枠（確定済みなら確定枠だけ、それ以外は現在の候補） */
export function answerSlots(event: Event & { slots: Slot[] }): Slot[] {
  const slots =
    event.status === "CONFIRMED"
      ? event.slots.filter((s) => s.id === event.confirmedSlotId)
      : event.slots.filter((s) => s.round === event.round);
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * 招待リンクからグループに参加する（F-12）。
 * グループ内の進行中の調整にもメンバーとして加わり、未連携なら入力された〇×を保存する。
 * 判定済みの調整は「あとから参加した人」として判定する。
 */
export async function joinGroup(
  groupId: string,
  userId: string,
  answers: (slotId: string) => boolean,
  now = new Date(),
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId } },
    create: { groupId, userId, joinedAt: now },
    update: {},
  });

  const events = await prisma.event.findMany({
    where: { groupId },
    include: { slots: true, members: { where: { userId } } },
  });
  for (const event of events.filter((e) => isJoinable(e, now) && e.members.length === 0)) {
    const member = await prisma.eventMember.create({ data: { eventId: event.id, userId, joinedAt: now } });
    if (!user.calendarLinked) {
      await prisma.manualAnswer.createMany({
        data: answerSlots(event).map((s) => ({ memberId: member.id, slotId: s.id, available: answers(s.id) })),
      });
    }
    await handleLateJoin(event.id, member.id);
  }
}
