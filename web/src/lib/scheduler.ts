import type { Event, EventMember, Origin, Slot, User } from "@prisma/client";
import { getBusy, insertEvent } from "./calendar";
import { prisma } from "./db";
import { decide, earliestSlot, isFree, summarize, travelWindow } from "./judge";
import { googleCalendarAddUrl, icsAttachment } from "./ics";
import { sendMail, type MailAttachment } from "./mail";
import { getTravelMinutes } from "./routes";
import { isTravelMode } from "./routes/types";
import { addMinutes, formatDateTime, formatSlot } from "./time";
import { scheduleWake } from "./timers";

export const JUDGE_DELAY_MIN = 60;
export const CHOICE_DEADLINE_HOURS = 24;
export const REMINDER_BEFORE_HOURS = 3;
export const TRAVEL_UNCOMPUTED_NOTICE = "移動時間は未計算です。間に合うかは各自で確認してください";

type MemberWithUser = EventMember & { user: User & { origins: Origin[] } };

type Evaluation = {
  slotId: string;
  available: boolean;
  source: "CALENDAR" | "MANUAL";
  travelComputed: boolean;
  outboundMin: number | null;
  returnMin: number | null;
};

function eventUrl(eventId: string) {
  return `${process.env.APP_URL}/events/${eventId}`;
}

async function notify(user: User, subject: string, body: string, attachments?: MailAttachment[]) {
  if (!user.notifyEmail) return;
  await sendMail(user.email, subject, body, attachments);
}

/** 新しい調整ができたことを、主催者以外のグループメンバーに知らせる */
export async function notifyNewEvent(eventId: string) {
  const event = await loadEvent(eventId);
  const slots = currentSlots(event)
    .map((s) => `・${formatSlot(s.start, s.end)}`)
    .join("\n");
  for (const m of event.members) {
    if (m.userId === event.organizerId) continue;
    await notify(
      m.user,
      `【${event.title}】新しい調整が作成されました`,
      `${event.organizer.name} さんが日程調整を始めました。\n集合場所：${event.meetingPlace}\n${slots}\n\n` +
        (m.user.calendarLinked
          ? "Googleカレンダーの空き状況から自動で判定します。操作は不要です。\n"
          : `${formatDateTime(event.judgeAt)} までに、候補ごとに〇×を入力してください。\n`) +
        eventUrl(event.id),
    );
  }
}

function defaultOrigin(user: User & { origins: Origin[] }): Origin | undefined {
  return user.origins.find((o) => o.isDefault) ?? user.origins[0];
}

/** 1人のメンバーについて、各候補枠の参加可否を判定する */
export async function evaluateMember(member: MemberWithUser, slots: Slot[], meetingPlace: string): Promise<Evaluation[]> {
  const user = member.user;
  const answers = await prisma.manualAnswer.findMany({ where: { memberId: member.id } });
  const manual = (slotId: string): Evaluation => ({
    slotId,
    available: answers.find((a) => a.slotId === slotId)?.available ?? false,
    source: "MANUAL",
    travelComputed: true,
    outboundMin: null,
    returnMin: null,
  });

  if (!user.calendarLinked) return slots.map((s) => manual(s.id));

  const origin = defaultOrigin(user);
  const mode = isTravelMode(user.travelMode) ? user.travelMode : "TRANSIT";
  const travel = await Promise.all(
    slots.map(async (s) => {
      if (!origin) return { out: null, ret: null };
      const base = { origin: origin.address, destination: meetingPlace, mode };
      const [out, ret] = await Promise.all([
        getTravelMinutes({ ...base, direction: "outbound", time: addMinutes(s.start, -5) }),
        getTravelMinutes({ ...base, direction: "return", time: s.end }),
      ]);
      return { out: out.ok ? out.minutes : null, ret: ret.ok ? ret.minutes : null };
    }),
  );

  const windows = slots.map((s, i) => travelWindow(s, travel[i].out ?? 0, travel[i].ret ?? 0));
  const timeMin = new Date(Math.min(...windows.map((w) => w.start.getTime())));
  const timeMax = new Date(Math.max(...windows.map((w) => w.end.getTime())));
  const busy = await getBusy(user.id, timeMin, timeMax);
  // カレンダーを取得できない場合（連携解除など）は手入力の回答で判定する
  if (!busy) return slots.map((s) => manual(s.id));

  return slots.map((s, i) => ({
    slotId: s.id,
    available: isFree(windows[i], busy),
    source: "CALENDAR",
    travelComputed: travel[i].out !== null && travel[i].ret !== null,
    outboundMin: travel[i].out,
    returnMin: travel[i].ret,
  }));
}

async function saveResults(memberId: string, evals: Evaluation[], lateJoin: boolean) {
  for (const e of evals) {
    const data = { ...e, lateJoin, judgedAt: new Date() };
    await prisma.slotResult.upsert({
      where: { slotId_memberId: { slotId: e.slotId, memberId } },
      create: { ...data, memberId },
      update: data,
    });
  }
}

async function loadEvent(eventId: string) {
  return prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      organizer: true,
      slots: true,
      members: { include: { user: { include: { origins: true } } } },
    },
  });
}

function currentSlots(event: Event & { slots: Slot[] }) {
  return event.slots.filter((s) => s.round === event.round).sort((a, b) => a.start.getTime() - b.start.getTime());
}

async function notifyTravelUncomputed(event: Event & { organizer: User }, members: User[]) {
  const subject = `【${event.title}】移動時間を計算できませんでした`;
  const body = `${TRAVEL_UNCOMPUTED_NOTICE}\n\n${eventUrl(event.id)}`;
  const targets = new Map([event.organizer, ...members].map((u) => [u.id, u]));
  for (const u of targets.values()) await notify(u, subject, body);
}

/**
 * 自動判定（F-15〜F-19）。募集中の調整を判定し、確定・選択依頼・全員不可時の対応へ進める。
 * 二重実行を避けるため、状態を JUDGING に切り替えられた場合だけ処理する。
 */
export async function judgeEvent(eventId: string, now = new Date()) {
  const claimed = await prisma.event.updateMany({
    where: { id: eventId, status: "COLLECTING" },
    data: { status: "JUDGING" },
  });
  if (claimed.count === 0) return;

  try {
    const event = await loadEvent(eventId);
    const slots = currentSlots(event);
    const members = event.members.filter((m) => m.joinedAt <= now);

    await prisma.slotResult.deleteMany({ where: { slotId: { in: slots.map((s) => s.id) } } });
    const uncomputed: User[] = [];
    const allResults: { slotId: string; memberId: string; available: boolean }[] = [];
    for (const m of members) {
      const evals = await evaluateMember(m, slots, event.meetingPlace);
      await saveResults(m.id, evals, false);
      if (evals.some((e) => !e.travelComputed)) uncomputed.push(m.user);
      allResults.push(...evals.map((e) => ({ slotId: e.slotId, memberId: m.id, available: e.available })));
    }

    const decision = decide(summarize(slots, members.map((m) => m.id), allResults));
    await prisma.event.update({
      where: { id: eventId },
      data: { judgedAt: now, travelUncomputed: uncomputed.length > 0 },
    });

    if (decision.kind === "CONFIRM") {
      // confirmEvent は選択待ちの状態からのみ確定するため、一度経由させる
      await prisma.event.update({ where: { id: eventId }, data: { status: "AWAITING_CHOICE" } });
      await confirmEvent(eventId, decision.slotId);
    } else if (decision.kind === "CHOOSE") {
      const deadline = addMinutes(now, CHOICE_DEADLINE_HOURS * 60);
      await prisma.event.update({
        where: { id: eventId },
        data: { status: "AWAITING_CHOICE", choiceDeadline: deadline },
      });
      scheduleWake(deadline);
      scheduleWake(addMinutes(deadline, -REMINDER_BEFORE_HOURS * 60));
      const list = slots
        .filter((s) => decision.slotIds.includes(s.id))
        .map((s) => `・${formatSlot(s.start, s.end)}`)
        .join("\n");
      await notify(
        event.organizer,
        `【${event.title}】全員が参加できる枠が複数あります。選んでください`,
        `全員が参加できる枠が ${decision.slotIds.length} つ見つかりました。\n${list}\n\n` +
          `${formatDateTime(deadline)} までに選ばない場合、最も早い枠で自動的に確定します。\n${eventUrl(eventId)}/choose`,
      );
    } else {
      await prisma.event.update({ where: { id: eventId }, data: { status: "AWAITING_FALLBACK" } });
      const best = decision.ranked[0];
      const bestSlot = slots.find((s) => s.id === best?.slotId);
      await notify(
        event.organizer,
        `【${event.title}】全員が参加できる枠がありませんでした`,
        (bestSlot
          ? `最も多く参加できるのは ${formatSlot(bestSlot.start, bestSlot.end)}（${best.availableCount}/${best.total}人）です。\n`
          : "") + `この枠で決行するか、候補を出し直すかを選んでください。\n${eventUrl(eventId)}/choose`,
      );
    }

    if (uncomputed.length > 0) await notifyTravelUncomputed(event, uncomputed);
  } catch (e) {
    // 失敗時は募集中に戻して次回の実行で再判定する
    await prisma.event.update({ where: { id: eventId }, data: { status: "COLLECTING" } });
    throw e;
  }
}

/** 予定を確定し、参加できるメンバーのカレンダーに書き込む（F-16, F-20） */
export async function confirmEvent(eventId: string, slotId: string, reason?: string) {
  const claimed = await prisma.event.updateMany({
    where: { id: eventId, status: { in: ["AWAITING_CHOICE", "AWAITING_FALLBACK"] } },
    data: { status: "CONFIRMED", confirmedSlotId: slotId, confirmedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const event = await loadEvent(eventId);
  const slot = event.slots.find((s) => s.id === slotId)!;
  const results = await prisma.slotResult.findMany({ where: { slotId } });
  for (const m of event.members) {
    const ok = results.find((r) => r.memberId === m.id)?.available ?? false;
    await applyAttendance(event, slot, m, ok, reason);
  }
}

async function applyAttendance(
  event: Event & { organizer: User },
  slot: Slot,
  member: EventMember & { user: User },
  available: boolean,
  reason?: string,
) {
  const when = formatSlot(slot.start, slot.end);
  if (!available) {
    await prisma.eventMember.update({ where: { id: member.id }, data: { attendance: "NOT_ATTENDING" } });
    await notify(
      member.user,
      `【${event.title}】予定が決まりました（不参加）`,
      `予定は ${when} に決まりましたが、あなたは予定が合わないため「不参加」となりました。\n${eventUrl(event.id)}`,
    );
    return;
  }
  const calendarEventId = await insertEvent(member.userId, {
    title: event.title,
    location: event.meetingPlace,
    description: `スケジュール調整アプリで確定した予定です。\n${eventUrl(event.id)}`,
    start: slot.start,
    end: slot.end,
  });
  await prisma.eventMember.update({
    where: { id: member.id },
    data: { attendance: "ATTENDING", calendarEventId },
  });
  const calendarInput = {
    id: event.id,
    title: event.title,
    location: event.meetingPlace,
    description: eventUrl(event.id),
    start: slot.start,
    end: slot.end,
  };
  // カレンダー未連携（または書き込み失敗）のメンバーには、ワンタップで登録できるリンクと .ics を送る（F-20）
  await notify(
    member.user,
    `【${event.title}】予定が確定しました`,
    `${when}\n集合場所：${event.meetingPlace}\n` +
      (reason ? `${reason}\n` : "") +
      (calendarEventId
        ? "Googleカレンダーに登録しました。\n"
        : `カレンダーに追加：${googleCalendarAddUrl(calendarInput)}\n（添付の .ics ファイルからも追加できます）\n`) +
      eventUrl(event.id),
    calendarEventId ? undefined : [icsAttachment(calendarInput)],
  );
}

/**
 * 判定後に参加したメンバーの処理（F-15）。
 * 確定済みなら確定枠だけで判定して参加者に追加／不参加とし、主催者の選択待ちなら選択材料として結果を保存する。
 */
export async function handleLateJoin(eventId: string, memberId: string) {
  const event = await loadEvent(eventId);
  if (event.status === "COLLECTING" || event.status === "CANCELLED") return;
  const member = event.members.find((m) => m.id === memberId);
  if (!member) return;

  if (event.status === "CONFIRMED" && event.confirmedSlotId) {
    const slot = event.slots.find((s) => s.id === event.confirmedSlotId)!;
    const [e] = await evaluateMember(member, [slot], event.meetingPlace);
    await saveResults(member.id, [e], true);
    await applyAttendance(event, slot, member, e.available);
    if (!e.travelComputed) await notifyTravelUncomputed(event, [member.user]);
    return;
  }

  const evals = await evaluateMember(member, currentSlots(event), event.meetingPlace);
  await saveResults(member.id, evals, true);
  if (evals.some((e) => !e.travelComputed)) await notifyTravelUncomputed(event, [member.user]);

  // 判定中に参加して、その間に確定した場合
  const latest = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const fresh = await prisma.eventMember.findUniqueOrThrow({ where: { id: memberId } });
  if (latest.status === "CONFIRMED" && latest.confirmedSlotId && !fresh.attendance) {
    const slot = event.slots.find((s) => s.id === latest.confirmedSlotId)!;
    const ok = evals.find((e) => e.slotId === slot.id)?.available ?? false;
    await applyAttendance({ ...latest, organizer: event.organizer }, slot, member, ok);
  }
}

/** 全員が参加できた枠（判定時点のメンバー基準） */
export async function allOkSlotIds(eventId: string): Promise<string[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { slots: true } });
  const slots = currentSlots(event);
  const results = await prisma.slotResult.findMany({
    where: { slotId: { in: slots.map((s) => s.id) }, lateJoin: false },
  });
  const memberIds = [...new Set(results.map((r) => r.memberId))];
  return summarize(slots, memberIds, results)
    .filter((s) => s.allOk)
    .map((s) => s.slotId);
}

/** 候補を出し直す（F-19）。新しい候補で募集をやり直す */
export async function reproposeSlots(eventId: string, slots: { start: Date; end: Date }[], now = new Date()) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { members: { include: { user: true } } },
  });
  if (event.status !== "AWAITING_FALLBACK") throw new Error("候補を出し直せる状態ではありません");
  const round = event.round + 1;
  const organizer = event.members.find((m) => m.userId === event.organizerId);
  await prisma.$transaction([
    prisma.slot.createMany({ data: slots.map((s) => ({ ...s, eventId, round })) }),
    prisma.event.update({
      where: { id: eventId },
      data: {
        round,
        status: "COLLECTING",
        judgeAt: addMinutes(now, JUDGE_DELAY_MIN),
        judgedAt: null,
        choiceDeadline: null,
        reminderSentAt: null,
        travelUncomputed: false,
      },
    }),
  ]);
  scheduleWake(addMinutes(now, JUDGE_DELAY_MIN));
  // カレンダー未連携の主催者は、新しい候補をすべて〇として初期登録（作成時と同じ扱い）
  if (organizer && !organizer.user.calendarLinked) {
    const created = await prisma.slot.findMany({ where: { eventId, round } });
    await prisma.manualAnswer.createMany({
      data: created.map((s) => ({ memberId: organizer.id, slotId: s.id, available: true })),
    });
  }
  for (const m of event.members) {
    if (m.userId === event.organizerId) continue;
    await notify(
      m.user,
      `【${event.title}】候補が出し直されました`,
      (m.user.calendarLinked
        ? "Googleカレンダーの空き状況から自動で判定します。操作は不要です。\n"
        : "新しい候補ごとに〇×を入力してください。\n") + eventUrl(eventId),
    );
  }
}

/** 期限の来た判定・期限切れの確定・リマインドを実行する */
export async function runDueJobs(now = new Date()) {
  const toJudge = await prisma.event.findMany({
    where: { status: "COLLECTING", judgeAt: { lte: now } },
    select: { id: true },
  });
  for (const e of toJudge) {
    try {
      await judgeEvent(e.id, now);
    } catch (err) {
      console.error("judgeEvent failed", e.id, err);
    }
  }

  const expired = await prisma.event.findMany({
    where: { status: "AWAITING_CHOICE", choiceDeadline: { lte: now } },
    include: { slots: true, organizer: true },
  });
  for (const e of expired) {
    const ids = await allOkSlotIds(e.id);
    const slot = earliestSlot(e.slots.filter((s) => ids.includes(s.id)));
    if (!slot) continue;
    await confirmEvent(e.id, slot.id, "主催者の選択期限（24時間）を過ぎたため、最も早い枠で確定しました。");
  }

  const remind = await prisma.event.findMany({
    where: {
      status: "AWAITING_CHOICE",
      reminderSentAt: null,
      choiceDeadline: { gt: now, lte: addMinutes(now, REMINDER_BEFORE_HOURS * 60) },
    },
    include: { organizer: true },
  });
  for (const e of remind) {
    await prisma.event.update({ where: { id: e.id }, data: { reminderSentAt: now } });
    await notify(
      e.organizer,
      `【${e.title}】枠の選択期限が近づいています`,
      `${formatDateTime(e.choiceDeadline!)} までに枠を選ばない場合、最も早い枠で自動的に確定します。\n${eventUrl(e.id)}/choose`,
    );
  }
}

/** サーバー起動時に、未来の判定・選択期限・リマインドの時刻にタイマーを設定する */
export async function scheduleAllPending() {
  const events = await prisma.event.findMany({
    where: { status: { in: ["COLLECTING", "AWAITING_CHOICE"] } },
    select: { status: true, judgeAt: true, choiceDeadline: true, reminderSentAt: true },
  });
  for (const e of events) {
    if (e.status === "COLLECTING") scheduleWake(e.judgeAt);
    if (e.status === "AWAITING_CHOICE" && e.choiceDeadline) {
      scheduleWake(e.choiceDeadline);
      if (!e.reminderSentAt) scheduleWake(addMinutes(e.choiceDeadline, -REMINDER_BEFORE_HOURS * 60));
    }
  }
}
