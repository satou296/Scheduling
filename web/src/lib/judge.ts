import { addMinutes } from "./time";
import type { Interval } from "./calendar";

/** 集合時刻の何分前に到着する前提で計算するか */
export const ARRIVAL_BUFFER_MIN = 5;

export type SlotWindow = { id: string; start: Date; end: Date };

/**
 * 出発時刻 = 開始時刻 − 5分 − 行きの移動時間
 * 帰着時刻 = 終了時刻 + 帰りの移動時間
 */
export function travelWindow(slot: { start: Date; end: Date }, outboundMin: number, returnMin: number): Interval {
  return {
    start: addMinutes(slot.start, -ARRIVAL_BUFFER_MIN - outboundMin),
    end: addMinutes(slot.end, returnMin),
  };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 出発から帰着までに予定（内容を問わない）が1つもなければ参加可能 */
export function isFree(window: Interval, busy: Interval[]): boolean {
  return !busy.some((b) => overlaps(window, b));
}

export type MemberSlotResult = { slotId: string; memberId: string; available: boolean };

export type SlotSummary = {
  slotId: string;
  start: Date;
  availableCount: number;
  total: number;
  allOk: boolean;
};

export function summarize(slots: SlotWindow[], memberIds: string[], results: MemberSlotResult[]): SlotSummary[] {
  return slots.map((s) => {
    const availableCount = memberIds.filter((m) =>
      results.some((r) => r.slotId === s.id && r.memberId === m && r.available),
    ).length;
    return {
      slotId: s.id,
      start: s.start,
      availableCount,
      total: memberIds.length,
      allOk: memberIds.length > 0 && availableCount === memberIds.length,
    };
  });
}

export type Decision =
  | { kind: "CONFIRM"; slotId: string }
  | { kind: "CHOOSE"; slotIds: string[] }
  | { kind: "FALLBACK"; ranked: SlotSummary[] };

/**
 * 全員OKの枠が1つ → 自動確定 / 複数 → 主催者が選択 / なし → 参加人数の多い順に示して主催者が判断
 */
export function decide(summaries: SlotSummary[]): Decision {
  const ok = summaries.filter((s) => s.allOk).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (ok.length === 1) return { kind: "CONFIRM", slotId: ok[0].slotId };
  if (ok.length > 1) return { kind: "CHOOSE", slotIds: ok.map((s) => s.slotId) };
  const ranked = [...summaries].sort(
    (a, b) => b.availableCount - a.availableCount || a.start.getTime() - b.start.getTime(),
  );
  return { kind: "FALLBACK", ranked };
}

/** 期限切れ時は最も早い枠で確定する */
export function earliestSlot<T extends { start: Date }>(slots: T[]): T | undefined {
  return [...slots].sort((a, b) => a.start.getTime() - b.start.getTime())[0];
}
