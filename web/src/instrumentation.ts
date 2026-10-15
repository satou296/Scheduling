// サーバー起動時に、判定・期限切れ確定・リマインドのタイマーを準備する
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __jobTimer?: NodeJS.Timeout };
  if (g.__jobTimer) return;
  const { runDueJobs, scheduleAllPending } = await import("./lib/scheduler");
  // 期限の来ている処理を実行し、今後の判定・期限・リマインドの時刻にタイマーを設定する
  await runDueJobs().catch((e) => console.error("runDueJobs failed", e));
  await scheduleAllPending().catch((e) => console.error("scheduleAllPending failed", e));
  // タイマーの取りこぼしに備えたフォールバック
  g.__jobTimer = setInterval(() => {
    runDueJobs().catch((e) => console.error("runDueJobs failed", e));
  }, 60_000);
}
