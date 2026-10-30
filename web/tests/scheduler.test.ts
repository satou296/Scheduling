import { OAuth2Client } from "google-auth-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { isInvalidGrant } from "@/lib/google-oauth";
import { GOOGLE_MONTHLY_LIMIT, GOOGLE_WARN_AT, cacheKey, reserveGoogleQuota } from "@/lib/routes";
import { cancelEvent, confirmEvent, handleLateJoin, judgeEvent, reproposeSlots, runDueJobs } from "@/lib/scheduler";
import { monthKey } from "@/lib/time";

const t = (s: string) => new Date(`${s}:00+09:00`);
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
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
    const a = await user({ busy: [["2099-11-01T10:00", "2099-11-01T12:00"]] });
    const e = await event(org.id, [["2099-11-01T10:00", "2099-11-01T12:00"], ["2099-11-01T14:00", "2099-11-01T16:00"]], [a.id]);
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
    const e = await event(org.id, [["2099-11-02T14:00", "2099-11-02T16:00"], ["2099-11-02T10:00", "2099-11-02T12:00"]], [a.id]);
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
    const a = await user({ busy: [["2099-11-03T00:00", "2099-11-03T23:59"]] });
    const e = await event(org.id, [["2099-11-03T10:00", "2099-11-03T12:00"]], [a.id]);
    await judgeEvent(e.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");
    await confirmEvent(e.id, e.slots[0].id);
    const members = await prisma.eventMember.findMany({ where: { eventId: e.id } });
    expect(members.find((m) => m.userId === a.id)?.attendance).toBe("NOT_ATTENDING");
    expect(members.find((m) => m.userId === org.id)?.attendance).toBe("ATTENDING");
  });

  it("全員不可なら主催者とメンバーに通知し、募集開始から2時間で中止", async () => {
    const org = await user();
    const a = await user({ busy: [["2099-11-10T00:00", "2099-11-10T23:59"]] });
    const e = await event(org.id, [["2099-11-10T10:00", "2099-11-10T12:00"]], [a.id]);
    const start = e.collectingSince;
    await judgeEvent(e.id, min(start, 60));
    let after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("AWAITING_FALLBACK");
    expect(after.choiceDeadline).toEqual(min(start, 120));
    for (const u of [org, a]) {
      expect(await prisma.mailLog.count({ where: { to: u.email, subject: { contains: "全員が参加できる枠がありませんでした" } } })).toBe(1);
    }

    await runDueJobs(min(start, 119));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");

    await runDueJobs(min(start, 120));
    after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CANCELLED");
    for (const u of [org, a]) {
      expect(await prisma.mailLog.count({ where: { to: u.email, subject: { contains: "中止" } } })).toBe(1);
    }
    // 中止後は決行できない
    await confirmEvent(e.id, e.slots[0].id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CANCELLED");
  });

  it("全員不可の対応期限は、今すぐ判定でも募集開始から2時間。判定が遅れたときは判定から1時間", async () => {
    const org = await user();
    const a = await user({ busy: [["2099-11-11T00:00", "2099-11-11T23:59"]] });
    const early = await event(org.id, [["2099-11-11T10:00", "2099-11-11T12:00"]], [a.id]);
    await judgeEvent(early.id, min(early.collectingSince, 5));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: early.id } })).choiceDeadline).toEqual(
      min(early.collectingSince, 120),
    );

    const late = await event(org.id, [["2099-11-11T10:00", "2099-11-11T12:00"]], [a.id]);
    const judgedAt = min(late.collectingSince, 180);
    await judgeEvent(late.id, judgedAt);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: late.id } })).choiceDeadline).toEqual(min(judgedAt, 60));
  });

  it("主催者が中止すると、主催者以外のメンバーに通知する", async () => {
    const org = await user();
    const a = await user({ busy: [["2099-11-12T00:00", "2099-11-12T23:59"]] });
    const e = await event(org.id, [["2099-11-12T10:00", "2099-11-12T12:00"]], [a.id]);
    await judgeEvent(e.id, min(e.collectingSince, 60));
    await cancelEvent(e.id, { auto: false });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CANCELLED");
    expect(await prisma.mailLog.count({ where: { to: a.email, subject: { contains: "中止" } } })).toBe(1);
    expect(await prisma.mailLog.count({ where: { to: org.email, subject: { contains: "中止" } } })).toBe(0);
  });

  it("候補を出し直すと募集開始と対応期限をリセットし、中止の対象から外れる", async () => {
    const org = await user();
    const a = await user({ busy: [["2099-11-13T00:00", "2099-11-13T23:59"]] });
    const e = await event(org.id, [["2099-11-13T10:00", "2099-11-13T12:00"]], [a.id]);
    await judgeEvent(e.id, min(e.collectingSince, 60));
    const now = min(e.collectingSince, 90);
    await reproposeSlots(e.id, [{ start: t("2099-11-14T10:00"), end: t("2099-11-14T12:00") }], now);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("COLLECTING");
    expect(after.round).toBe(2);
    expect(after.collectingSince).toEqual(now);
    expect(after.choiceDeadline).toBeNull();
    // 元の期限を過ぎても中止されない（再判定の時刻より前）
    await runDueJobs(min(e.collectingSince, 121));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("COLLECTING");
    // 対応待ちでなくなったので、もう一度出し直すことはできない
    await expect(reproposeSlots(e.id, [{ start: t("2099-11-15T10:00"), end: t("2099-11-15T12:00") }], now)).rejects.toThrow();
  });

  it("終日の予定がある日は不可", async () => {
    const org = await user();
    const a = await user();
    // 11/8 の終日の予定（0:00〜翌 0:00）
    await prisma.devCalendarEvent.create({
      data: { userId: a.id, title: "旅行", start: t("2099-11-08T00:00"), end: t("2099-11-09T00:00"), allDay: true },
    });
    const e = await event(org.id, [["2099-11-08T13:00", "2099-11-08T16:00"], ["2099-11-09T13:00", "2099-11-09T16:00"]], [a.id]);
    await judgeEvent(e.id);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[1].id); // 11/9 の枠だけが全員OK
  });

  it("手入力のメンバーは〇×をそのまま使う", async () => {
    const org = await user();
    const m = await user({ linked: false });
    const e = await event(org.id, [["2099-11-04T10:00", "2099-11-04T12:00"], ["2099-11-04T14:00", "2099-11-04T16:00"]], [m.id]);
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

// Google で連携したユーザー（モックカレンダーではない）。トークンの更新は各テストでモックする
async function googleUser() {
  return prisma.user.create({
    data: {
      email: `g${++seq}@example.com`,
      name: `google${seq}`,
      calendarLinked: true,
      refreshToken: "refresh-token",
      onboarded: true,
      origins: { create: { label: "自宅", address: "渋谷駅", isDefault: true } },
    },
  });
}

const invalidGrant = () =>
  Object.assign(new Error("invalid_grant"), {
    response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
  });

function mockTokenRefresh(error: Error) {
  // getAccessToken はオーバーロードがあるため、型を合わせずにモックする
  vi.spyOn(OAuth2Client.prototype, "getAccessToken").mockRejectedValue(error as never);
}

describe("Googleカレンダーの連携が切れたとき", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isInvalidGrant は権限が無効になったエラーだけを判別する", () => {
    expect(isInvalidGrant(invalidGrant())).toBe(true);
    expect(isInvalidGrant(new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com"))).toBe(false);
    expect(isInvalidGrant(undefined)).toBe(false);
  });

  it("判定は止まらず、その人は〇×の手入力で判定し、未連携に戻して知らせる", async () => {
    mockTokenRefresh(invalidGrant());
    const org = await user();
    const broken = await googleUser();
    const e = await event(org.id, [["2099-11-20T10:00", "2099-11-20T12:00"]], [broken.id]);
    const member = await prisma.eventMember.findFirstOrThrow({ where: { eventId: e.id, userId: broken.id } });
    await prisma.manualAnswer.create({ data: { memberId: member.id, slotId: e.slots[0].id, available: true } });

    await judgeEvent(e.id);

    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    const result = await prisma.slotResult.findFirstOrThrow({ where: { memberId: member.id } });
    expect(result.source).toBe("MANUAL");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: broken.id } });
    expect(u.calendarLinked).toBe(false);
    expect(u.refreshToken).toBeNull();
    expect(await prisma.mailLog.count({ where: { to: broken.email, subject: "Googleカレンダーの連携が切れました" } })).toBe(1);
    // カレンダーに書き込めないので、確定メールに .ics を付ける
    const confirmed = await prisma.mailLog.findFirstOrThrow({ where: { to: broken.email, subject: { contains: "予定が確定しました" } } });
    expect(confirmed.body).toContain("[添付]");
    expect((await prisma.eventMember.findUniqueOrThrow({ where: { id: member.id } })).attendance).toBe("ATTENDING");
  });

  it("一時的なエラーでは連携を外さず、その回は〇×の手入力で判定する", async () => {
    mockTokenRefresh(new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com"));
    const org = await user();
    const flaky = await googleUser();
    const e = await event(org.id, [["2099-11-21T10:00", "2099-11-21T12:00"]], [flaky.id]);

    await judgeEvent(e.id);

    // 〇×の入力がないので不可 → 全員不可の対応待ちに進む（募集中のまま止まらない）
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: flaky.id } })).calendarLinked).toBe(true);
    expect(await prisma.mailLog.count({ where: { to: flaky.email, subject: "Googleカレンダーの連携が切れました" } })).toBe(0);
  });

  it("確定のときに書き込めない人がいても、後に続く参加者の出欠も記録する", async () => {
    const org = await user();
    const broken = await googleUser();
    const a = await user();
    const e = await event(org.id, [["2099-11-22T10:00", "2099-11-22T12:00"]], [broken.id, a.id]);
    await prisma.event.update({ where: { id: e.id }, data: { status: "AWAITING_CHOICE" } });
    const members = await prisma.eventMember.findMany({ where: { eventId: e.id } });
    await prisma.slotResult.createMany({
      data: members.map((m) => ({ slotId: e.slots[0].id, memberId: m.id, available: true, source: "MANUAL" })),
    });
    mockTokenRefresh(invalidGrant());

    await confirmEvent(e.id, e.slots[0].id);

    const after = await prisma.eventMember.findMany({ where: { eventId: e.id } });
    expect(after.every((m) => m.attendance === "ATTENDING")).toBe(true);
    expect(after.find((m) => m.userId === broken.id)?.calendarEventId).toBeNull();
    expect(await prisma.devCalendarEvent.count({ where: { userId: a.id, title: "テスト" } })).toBe(1);
  });
});

// サーバーが止まっていて判定や期限の処理が遅れた場合など
describe("開始時刻を過ぎた候補", () => {
  it("判定が遅れたときは、開始時刻を過ぎた候補を除いて判定する", async () => {
    const org = await user();
    const a = await user();
    const e = await event(org.id, [["2099-11-20T10:00", "2099-11-20T12:00"], ["2099-11-20T14:00", "2099-11-20T16:00"]], [a.id]);
    await judgeEvent(e.id, t("2099-11-20T10:30"));
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[1].id);
    expect(await prisma.slotResult.count({ where: { slotId: e.slots[0].id } })).toBe(0);
  });

  it("候補がすべて過ぎていたら確定せず、主催者に出し直しか中止を選んでもらう", async () => {
    const org = await user();
    const a = await user();
    const e = await event(org.id, [["2099-11-21T10:00", "2099-11-21T12:00"]], [a.id]);
    await judgeEvent(e.id, t("2099-11-21T13:00"));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");
    expect(await prisma.devCalendarEvent.count({ where: { userId: a.id, title: "テスト" } })).toBe(0);
    const mail = await prisma.mailLog.findFirstOrThrow({ where: { to: org.email } });
    expect(mail.body).toContain("候補の日時がすべて過ぎていました");
    // 過ぎた枠では決行できない
    await expect(confirmEvent(e.id, e.slots[0].id, { now: t("2099-11-21T13:30") })).rejects.toThrow();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_FALLBACK");
  });

  it("選択期限が過ぎたときは、開始時刻を過ぎていない最も早い枠で確定する", async () => {
    const org = await user();
    const a = await user();
    const e = await event(org.id, [["2099-11-22T20:00", "2099-11-22T22:00"], ["2099-11-23T20:00", "2099-11-23T22:00"]], [a.id]);
    await judgeEvent(e.id, t("2099-11-22T08:00"));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("AWAITING_CHOICE");
    await runDueJobs(t("2099-11-23T09:00"));
    const after = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedSlotId).toBe(e.slots[1].id);
  });

  it("選択期限が過ぎたときに全員が参加できる枠がすべて過ぎていたら、中止してメンバー全員に知らせる", async () => {
    const org = await user();
    const a = await user();
    const e = await event(org.id, [["2099-11-24T20:00", "2099-11-24T22:00"], ["2099-11-25T20:00", "2099-11-25T22:00"]], [a.id]);
    await judgeEvent(e.id, t("2099-11-24T08:00"));
    await runDueJobs(t("2099-11-26T00:00"));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CANCELLED");
    for (const u of [org, a]) {
      expect(await prisma.mailLog.count({ where: { to: u.email, subject: { contains: "中止" } } })).toBe(1);
    }
  });
});

describe("handleLateJoin", () => {
  it("確定後に参加した人は、参加可能なら参加者に追加、不可なら不参加", async () => {
    const org = await user();
    const e = await event(org.id, [["2099-11-05T10:00", "2099-11-05T12:00"]], []);
    await judgeEvent(e.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CONFIRMED");

    const free = await user();
    const busy = await user({ busy: [["2099-11-05T09:00", "2099-11-05T11:00"]] });
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
    const e = await event(org.id, [["2099-11-06T10:00", "2099-11-06T12:00"], ["2099-11-06T14:00", "2099-11-06T16:00"]], []);
    await judgeEvent(e.id);
    const late = await user({ busy: [["2099-11-06T10:00", "2099-11-06T12:00"]] });
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
    expect(cacheKey({ ...base, time: t("2099-11-02T10:05") })).toBe(cacheKey({ ...base, time: t("2099-11-09T10:55") }));
    expect(cacheKey({ ...base, time: t("2099-11-02T10:05") })).not.toBe(cacheKey({ ...base, time: t("2099-11-01T10:05") }));
  });
});
