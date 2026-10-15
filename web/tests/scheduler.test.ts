import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GOOGLE_MONTHLY_LIMIT, GOOGLE_WARN_AT, cacheKey, reserveGoogleQuota } from "@/lib/routes";
import { confirmEvent, handleLateJoin, judgeEvent, runDueJobs } from "@/lib/scheduler";
import { monthKey } from "@/lib/time";

const t = (s: string) => new Date(`${s}:00+09:00`);
let seq = 0;

async function user(opts: { linked?: boolean; busy?: [string, string][] } = {}) {
  const u = await prisma.user.create({
    data: {
      email: `u${++seq}@dev.local`,
      name: `user${seq}`,
      isDevUser: true,
      calendarLinked: opts.linked ?? true,
      onboarded: true,
      // 起点＝集合場所にして移動時間を0分にする（モック）
      origins: { create: { label: "自宅", address: "渋谷駅", isDefault: true } },
    },
  });
  for (const [s, e] of opts.busy ?? []) {
    await prisma.devCalendarEvent.create({ data: { userId: u.id, title: "busy", start: t(s), end: t(e) } });
  }
  return u;
}

async function event(organizerId: string, slots: [string, string][], memberIds: string[]) {
  const group = await prisma.group.create({
    data: {
      name: "テストグループ",
      ownerId: organizerId,
      inviteToken: `tok${++seq}`,
      members: { create: [organizerId, ...memberIds].map((userId) => ({ userId })) },
    },
  });
  return prisma.event.create({
    data: {
      title: "テスト",
      meetingPlace: "渋谷駅",
      organizerId,
      groupId: group.id,
      judgeAt: new Date(Date.now() - 1000),
      slots: { create: slots.map(([s, e]) => ({ start: t(s), end: t(e), round: 1 })) },
      members: {
        create: [
          { userId: organizerId, role: "ORGANIZER" },
          ...memberIds.map((userId) => ({ userId })),
        ],
      },
    },
    include: { slots: { orderBy: { start: "asc" } } },
  });
}

beforeEach(async () => {
  await prisma.mailLog.deleteMany();
});

describe("judgeEvent", () => {
  it("全員OKが1枠なら自動確定し、カレンダーへ書き込む", async () => {
    const org = await user();
    const a = await user({ busy: [["2026-11-01T10:00", "2026-11-01T12:00"]] });
    const e = await event(org.id, [["2026-11-01T10:00", "2026-11-01T12:00"], ["2026-11-01T14:00", "2026-11-01T16:00"]], [a.id]);
    await judgeEvent(e.id);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[1].id);
    const written = await prisma.devCalendarEvent.count({ where: { userId: a.id, title: "テスト" } });
    expect(written).toBe(1);
  });

  it("全員OKが複数なら主催者の選択待ち、期限切れで最も早い枠に確定", async () => {
    const org = await user();
    const a = await user();
    const e = await event(org.id, [["2026-11-02T14:00", "2026-11-02T16:00"], ["2026-11-02T10:00", "2026-11-02T12:00"]], [a.id]);
    await judgeEvent(e.id);
    let after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("AWAITING_CHOICE");
    expect(after.choiceDeadline).not.toBeNull();
    expect(await prisma.mailLog.count({ where: { to: org.email } })).toBe(1);

    // 期限の3時間前以内ならリマインド
    await runDueJobs(new Date(after.choiceDeadline!.getTime() - 60 * 60_000));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).reminderSentAt).not.toBeNull();

    await runDueJobs(new Date(after.choiceDeadline!.getTime() + 1000));
    after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[0].id); // 10:00 の枠
  });

  it("全員不可なら主催者の対応待ち。決行すると不可のメンバーは不参加", async () => {
    const org = await user();
    const a = await user({ busy: [["2026-11-03T00:00", "2026-11-03T23:59"]] });
    const e = await event(org.id, [["2026-11-03T10:00", "2026-11-03T12:00"]], [a.id]);
    await judgeEvent(e.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");
    await confirmEvent(e.id, e.slots[0].id);
    const members = await prisma.eventMember.findMany({ where: { eventId: e.id } });
    expect(members.find((m) => m.userId === a.id)?.attendance).toBe("NOT_ATTENDING");
    expect(members.find((m) => m.userId === org.id)?.attendance).toBe("ATTENDING");
  });

  it("終日の予定がある日は不可", async () => {
    const org = await user();
    const a = await user();
    // 11/8 の終日の予定（0:00〜翌 0:00）
    await prisma.devCalendarEvent.create({
      data: { userId: a.id, title: "旅行", start: t("2026-11-08T00:00"), end: t("2026-11-09T00:00"), allDay: true },
    });
    const e = await event(org.id, [["2026-11-08T13:00", "2026-11-08T16:00"], ["2026-11-09T13:00", "2026-11-09T16:00"]], [a.id]);
    await judgeEvent(e.id);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[1].id); // 11/9 の枠だけが全員OK
  });

  it("手入力のメンバーは〇×をそのまま使う", async () => {
    const org = await user();
    const m = await user({ linked: false });
    const e = await event(org.id, [["2026-11-04T10:00", "2026-11-04T12:00"], ["2026-11-04T14:00", "2026-11-04T16:00"]], [m.id]);
    const member = await prisma.eventMember.findFirstOrThrow({ where: { eventId: e.id, userId: m.id } });
    await prisma.manualAnswer.createMany({
      data: [
        { memberId: member.id, slotId: e.slots[0].id, available: true },
        { memberId: member.id, slotId: e.slots[1].id, available: false },
      ],
    });
    await judgeEvent(e.id);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.confirmedSlotId).toBe(e.slots[0].id);
  });
});

describe("handleLateJoin", () => {
  it("確定後に参加した人は、参加可能なら参加者に追加、不可なら不参加", async () => {
    const org = await user();
    const e = await event(org.id, [["2026-11-05T10:00", "2026-11-05T12:00"]], []);
    await judgeEvent(e.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CONFIRMED");

    const free = await user();
    const busy = await user({ busy: [["2026-11-05T09:00", "2026-11-05T11:00"]] });
    for (const u of [free, busy]) {
      const m = await prisma.eventMember.create({ data: { eventId: e.id, userId: u.id } });
      await handleLateJoin(e.id, m.id);
    }
    const members = await prisma.eventMember.findMany({ where: { eventId: e.id } });
    expect(members.find((m) => m.userId === free.id)?.attendance).toBe("ATTENDING");
    expect(members.find((m) => m.userId === busy.id)?.attendance).toBe("NOT_ATTENDING");
  });

  it("主催者の選択待ちの間に参加した人の結果は選択材料として保存し、全員OKの判定は変えない", async () => {
    const org = await user();
    const e = await event(org.id, [["2026-11-06T10:00", "2026-11-06T12:00"], ["2026-11-06T14:00", "2026-11-06T16:00"]], []);
    await judgeEvent(e.id);
    const late = await user({ busy: [["2026-11-06T10:00", "2026-11-06T12:00"]] });
    const m = await prisma.eventMember.create({ data: { eventId: e.id, userId: late.id } });
    await handleLateJoin(e.id, m.id);
    const results = await prisma.slotResult.findMany({ where: { memberId: m.id } });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.lateJoin)).toBe(true);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_CHOICE");
  });
});

describe("Google Routes の利用上限", () => {
  it("80%で開発者に通知し、上限で停止する", async () => {
    process.env.DEVELOPER_EMAIL = "dev@example.com";
    const month = monthKey();
    await prisma.apiUsage.deleteMany();
    await prisma.apiUsage.create({ data: { provider: "google-routes", month, count: GOOGLE_WARN_AT - 1 } });
    expect(await reserveGoogleQuota()).toBe(true);
    expect(await prisma.mailLog.count({ where: { to: "dev@example.com" } })).toBe(1);

    await prisma.apiUsage.updateMany({ data: { count: GOOGLE_MONTHLY_LIMIT } });
    expect(await reserveGoogleQuota()).toBe(false);
    expect(await reserveGoogleQuota()).toBe(false);
    expect(await prisma.mailLog.count({ where: { to: "dev@example.com" } })).toBe(2);
  });

  it("同じ起点・集合場所・手段・方向・時間帯はキャッシュキーが同じ", () => {
    const base = { origin: "A", destination: "B", mode: "DRIVE" as const, direction: "outbound" as const };
    expect(cacheKey({ ...base, time: t("2026-11-02T10:05") })).toBe(cacheKey({ ...base, time: t("2026-11-09T10:55") }));
    expect(cacheKey({ ...base, time: t("2026-11-02T10:05") })).not.toBe(cacheKey({ ...base, time: t("2026-11-01T10:05") }));
  });
});
