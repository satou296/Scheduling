/**
 * 判定・期限切れ確定・リマインドを「その時刻ちょうど」に実行するためのタイマー（非機能要件：判定の速さ）。
 * 発火時は期限の来た処理をまとめて実行する runDueJobs を呼ぶだけなので、重複して発火しても安全。
 * サーバーが常駐しない環境（サーバーレス）では /api/cron を外部から定期実行する。
 */
const MAX_DELAY_MS = 2 ** 31 - 1; // setTimeout の上限（約24.8日）

type TimerState = { timers: Map<number, NodeJS.Timeout> };
const g = globalThis as unknown as { __wakeTimers?: TimerState };
const state: TimerState = (g.__wakeTimers ??= { timers: new Map() });

export function scheduleWake(at: Date) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const time = at.getTime();
  if (state.timers.has(time)) return;
  const delay = Math.max(0, time - Date.now());
  if (delay > MAX_DELAY_MS) return; // 定期実行（フォールバック）で拾う
  const timer = setTimeout(async () => {
    state.timers.delete(time);
    try {
      const { runDueJobs } = await import("./scheduler");
      await runDueJobs();
    } catch (e) {
      console.error("runDueJobs (timer) failed", e);
    }
  }, delay);
  timer.unref?.();
  state.timers.set(time, timer);
}

export function pendingWakeCount(): number {
  return state.timers.size;
}
