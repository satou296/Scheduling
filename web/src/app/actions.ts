"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { joinGroup, newInviteToken } from "@/lib/groups";
import { isTravelMode } from "@/lib/routes/types";
import {
  JUDGE_DELAY_MIN,
  allOkSlotIds,
  confirmEvent,
  judgeEvent,
  notifyNewEvent,
  reproposeSlots,
} from "@/lib/scheduler";
import { scheduleWake } from "@/lib/timers";
import { devLoginEnabled, requireUser, safeNext, setSession } from "@/lib/session";
import { addMinutes, parseJstDateTime, parseJstLocal, startOfDayInZone } from "@/lib/time";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function parseSlots(form: FormData): { start: Date; end: Date }[] {
  const dates = form.getAll("slot_date").map(String);
  const starts = form.getAll("slot_start").map(String);
  const ends = form.getAll("slot_end").map(String);
  const slots = dates.map((date, i) => ({
    start: parseJstDateTime(date, starts[i]),
    end: parseJstDateTime(date, ends[i]),
  }));
  if (slots.length === 0) throw new Error("候補を1つ以上入力してください");
  for (const s of slots) {
    if (s.end <= s.start) throw new Error("終了時刻は開始時刻より後にしてください");
  }
  return slots;
}

async function requireMember(eventId: string) {
  const user = await requireUser();
  const member = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    include: { event: true },
  });
  if (!member) throw new Error("この調整のメンバーではありません");
  return { user, member, event: member.event };
}

async function requireOrganizer(eventId: string) {
  const ctx = await requireMember(eventId);
  if (ctx.event.organizerId !== ctx.user.id) throw new Error("主催者のみ操作できます");
  return ctx;
}

// ---------- 開発用ログイン ----------

export async function devLogin(form: FormData) {
  if (!devLoginEnabled()) throw new Error("開発用ログインは無効です");
  const name = str(form, "name") || "テストユーザー";
  // 名前全体のハッシュで識別する（同じ名前なら同じユーザー）
  const email = `${createHash("sha256").update(name).digest("hex").slice(0, 20)}@dev.local`;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, isDevUser: true },
    update: {},
  });
  await setSession(user.id);
  const next = safeNext(str(form, "next"));
  redirect(user.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
}

// ---------- アカウント・設定 ----------

export async function linkDevCalendar(form: FormData) {
  const user = await requireUser();
  if (!user.isDevUser) throw new Error("開発用ユーザーのみ");
  await prisma.user.update({ where: { id: user.id }, data: { calendarLinked: true } });
  revalidatePath(str(form, "path") || "/settings");
}

export async function unlinkCalendar() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { calendarLinked: false, accessToken: null, refreshToken: null, tokenExpiresAt: null },
  });
  revalidatePath("/settings");
}

export async function addOrigin(form: FormData) {
  const user = await requireUser();
  const label = str(form, "label") || "自宅";
  const address = str(form, "address");
  if (!address) throw new Error("住所を入力してください");
  const count = await prisma.origin.count({ where: { userId: user.id } });
  await prisma.origin.create({ data: { userId: user.id, label, address, isDefault: count === 0 } });
  revalidatePath(str(form, "path") || "/settings");
}

export async function setDefaultOrigin(form: FormData) {
  const user = await requireUser();
  const id = str(form, "id");
  await prisma.$transaction([
    prisma.origin.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    prisma.origin.updateMany({ where: { userId: user.id, id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/settings");
}

export async function deleteOrigin(form: FormData) {
  const user = await requireUser();
  const id = str(form, "id");
  const origin = await prisma.origin.findFirst({ where: { id, userId: user.id } });
  if (!origin) return;
  await prisma.origin.delete({ where: { id } });
  if (origin.isDefault) {
    const next = await prisma.origin.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.origin.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  revalidatePath("/settings");
}

export async function updateSettings(form: FormData) {
  const user = await requireUser();
  const travelMode = str(form, "travelMode");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(isTravelMode(travelMode) ? { travelMode } : {}),
      notifyEmail: form.get("notifyEmail") === "on",
    },
  });
  revalidatePath("/settings");
}

export async function completeOnboarding(form: FormData) {
  const user = await requireUser();
  const travelMode = str(form, "travelMode");
  await prisma.user.update({
    where: { id: user.id },
    data: { onboarded: true, ...(isTravelMode(travelMode) ? { travelMode } : {}) },
  });
  redirect(safeNext(str(form, "next")));
}

export async function addDevBusy(form: FormData) {
  const user = await requireUser();
  if (!user.isDevUser) throw new Error("開発用ユーザーのみ");
  const start = parseJstLocal(str(form, "start"));
  const end = parseJstLocal(str(form, "end"));
  if (end <= start) throw new Error("終了は開始より後にしてください");
  await prisma.devCalendarEvent.create({ data: { userId: user.id, title: str(form, "title") || "予定", start, end } });
  revalidatePath("/settings");
}

export async function addDevAllDay(form: FormData) {
  const user = await requireUser();
  if (!user.isDevUser) throw new Error("開発用ユーザーのみ");
  const startDate = str(form, "startDate");
  const endDate = str(form, "endDate") || startDate;
  if (endDate < startDate) throw new Error("終了日は開始日以降にしてください");
  // Google カレンダーと同じく、終了は最終日の翌日 0:00（その日を含まない）
  const start = startOfDayInZone(startDate);
  const end = addMinutes(startOfDayInZone(endDate), 24 * 60);
  await prisma.devCalendarEvent.create({
    data: { userId: user.id, title: str(form, "title") || "終日の予定", start, end, allDay: true },
  });
  revalidatePath("/settings");
}

export async function deleteDevBusy(form: FormData) {
  const user = await requireUser();
  await prisma.devCalendarEvent.deleteMany({ where: { id: str(form, "id"), userId: user.id } });
  revalidatePath("/settings");
}

// ---------- グループ ----------

export async function createGroup(form: FormData) {
  const user = await requireUser();
  const name = str(form, "name");
  if (!name) throw new Error("グループ名を入力してください");
  const group = await prisma.group.create({
    data: {
      name,
      ownerId: user.id,
      inviteToken: newInviteToken(),
      members: { create: { userId: user.id } },
    },
  });
  redirect(`/groups/${group.id}?created=1`);
}

export async function joinGroupByInvite(token: string, form: FormData) {
  const user = await requireUser(`/invite/${token}`);
  const group = await prisma.group.findUnique({ where: { inviteToken: token } });
  if (!group) throw new Error("招待リンクが無効です");
  await joinGroup(group.id, user.id, (slotId) => form.get(`answer_${slotId}`) === "yes");
  redirect(`/groups/${group.id}`);
}

// ---------- 調整 ----------

export async function createEvent(form: FormData) {
  const user = await requireUser();
  const title = str(form, "title");
  const meetingPlace = str(form, "meetingPlace");
  if (!title || !meetingPlace) throw new Error("タイトルと集合場所を入力してください");
  const slots = parseSlots(form);
  const now = new Date();

  // 既存のグループを選ぶか、その場で新しいグループを作る（F-11）
  let groupId = str(form, "groupId");
  if (groupId) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!membership) throw new Error("このグループのメンバーではありません");
  } else {
    const name = str(form, "groupName") || title;
    const group = await prisma.group.create({
      data: { name, ownerId: user.id, inviteToken: newInviteToken(), members: { create: { userId: user.id } } },
    });
    groupId = group.id;
  }

  // グループの現メンバー全員がこの調整の参加者になる
  const groupMembers = await prisma.groupMember.findMany({ where: { groupId }, include: { user: true } });
  const event = await prisma.event.create({
    data: {
      title,
      meetingPlace,
      groupId,
      organizerId: user.id,
      judgeAt: addMinutes(now, JUDGE_DELAY_MIN),
      slots: { create: slots.map((s) => ({ ...s, round: 1 })) },
      members: {
        create: groupMembers.map((m) => ({
          userId: m.userId,
          role: m.userId === user.id ? "ORGANIZER" : "MEMBER",
          joinedAt: now,
        })),
      },
    },
    include: { slots: true, members: true },
  });
  // カレンダー未連携の主催者は、自分で出した候補をすべて〇として初期登録（あとで変更可）
  if (!user.calendarLinked) {
    const organizer = event.members.find((m) => m.userId === user.id)!;
    await prisma.manualAnswer.createMany({
      data: event.slots.map((s) => ({ memberId: organizer.id, slotId: s.id, available: true })),
    });
  }
  scheduleWake(event.judgeAt);
  await notifyNewEvent(event.id);
  redirect(`/events/${event.id}?created=1`);
}

async function saveManualAnswers(memberId: string, slotIds: string[], form: FormData) {
  for (const slotId of slotIds) {
    const available = form.get(`answer_${slotId}`) === "yes";
    await prisma.manualAnswer.upsert({
      where: { memberId_slotId: { memberId, slotId } },
      create: { memberId, slotId, available },
      update: { available },
    });
  }
}

export async function saveAnswers(eventId: string, form: FormData) {
  const { member, event } = await requireMember(eventId);
  if (event.status !== "COLLECTING") throw new Error("判定後は回答を変更できません");
  const slots = await prisma.slot.findMany({ where: { eventId, round: event.round } });
  await saveManualAnswers(member.id, slots.map((s) => s.id), form);
  revalidatePath(`/events/${eventId}`);
}

export async function judgeNow(eventId: string) {
  await requireOrganizer(eventId);
  await judgeEvent(eventId);
  revalidatePath(`/events/${eventId}`);
}

export async function chooseSlot(eventId: string, form: FormData) {
  const { event } = await requireOrganizer(eventId);
  const slotId = str(form, "slotId");
  if (event.status === "AWAITING_CHOICE" && !(await allOkSlotIds(eventId)).includes(slotId)) {
    throw new Error("全員が参加できる枠から選んでください");
  }
  const slot = await prisma.slot.findFirst({ where: { id: slotId, eventId, round: event.round } });
  if (!slot) throw new Error("枠が見つかりません");
  await confirmEvent(eventId, slotId);
  redirect(`/events/${eventId}`);
}

export async function repropose(eventId: string, form: FormData) {
  await requireOrganizer(eventId);
  await reproposeSlots(eventId, parseSlots(form));
  redirect(`/events/${eventId}`);
}
