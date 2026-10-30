import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { joinGroup } from "@/lib/groups";
import { judgeEvent } from "@/lib/scheduler";

const t = (s: string) => new Date(`${s}:00+09:00`);
let seq = 1000;

async function user(linked = true) {
  return prisma.user.create({
    data: {
      email: `g${++seq}@dev.local`,
      name: `guser${seq}`,
      isDevUser: true,
      calendarLinked: linked,
      onboarded: true,
      origins: { create: { label: "自宅", address: "渋谷駅", isDefault: true } },
    },
  });
}

async function groupWithEvent(ownerId: string, status: "COLLECTING" | "CONFIRMED", slot: [string, string]) {
  const group = await prisma.group.create({
    data: { name: "G", ownerId, inviteToken: `g${++seq}`, members: { create: { userId: ownerId } } },
  });
  const event = await prisma.event.create({
    data: {
      title: "E",
      meetingPlace: "渋谷駅",
      groupId: group.id,
      organizerId: ownerId,
      judgeAt: new Date(Date.now() + 3600_000),
      slots: { create: { start: t(slot[0]), end: t(slot[1]), round: 1 } },
      members: { create: { userId: ownerId, role: "ORGANIZER" } },
    },
    include: { slots: true },
  });
  if (status === "CONFIRMED") {
    await prisma.event.update({ where: { id: event.id }, data: { status, confirmedSlotId: event.slots[0].id } });
  }
  return { group, event };
}

describe("joinGroup", () => {
  it("募集中の調整にメンバーとして加わり、未連携なら〇×を保存する", async () => {
    const owner = await user();
    const { group, event } = await groupWithEvent(owner.id, "COLLECTING", ["2099-12-01T10:00", "2099-12-01T12:00"]);
    const manual = await user(false);
    await joinGroup(group.id, manual.id, () => true);

    const member = await prisma.eventMember.findUniqueOrThrow({
      where: { eventId_userId: { eventId: event.id, userId: manual.id } },
      include: { answers: true },
    });
    expect(member.answers).toHaveLength(1);
    expect(member.answers[0].available).toBe(true);

    // 判定ではグループ参加者として判定対象になる
    await prisma.event.update({ where: { id: event.id }, data: { judgeAt: new Date(Date.now() - 1000) } });
    await judgeEvent(event.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("CONFIRMED");
  });

  it("確定済みでまだ終わっていない予定には、参加可能なら参加者として追加される", async () => {
    const owner = await user();
    const { group, event } = await groupWithEvent(owner.id, "CONFIRMED", ["2099-01-01T10:00", "2099-01-01T12:00"]);
    const late = await user();
    await joinGroup(group.id, late.id, () => false);
    const member = await prisma.eventMember.findUniqueOrThrow({
      where: { eventId_userId: { eventId: event.id, userId: late.id } },
    });
    expect(member.attendance).toBe("ATTENDING");
    expect(await prisma.devCalendarEvent.count({ where: { userId: late.id } })).toBe(1);
  });

  it("終わった予定には加わらない。二重に参加しても重複しない", async () => {
    const owner = await user();
    const { group, event } = await groupWithEvent(owner.id, "CONFIRMED", ["2020-01-01T10:00", "2020-01-01T12:00"]);
    const late = await user();
    await joinGroup(group.id, late.id, () => true);
    await joinGroup(group.id, late.id, () => true);
    expect(await prisma.eventMember.count({ where: { eventId: event.id, userId: late.id } })).toBe(0);
    expect(await prisma.groupMember.count({ where: { groupId: group.id, userId: late.id } })).toBe(1);
  });
});
