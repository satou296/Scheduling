// サーバー起動時に、判定・期限切れ確定・リマインドを定期実行するタイマーを開始する
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __jobTimer?: NodeJS.Timeout };
  if (g.__jobTimer) return;
  const { runDueJobs } = await import("./lib/scheduler");
  g.__jobTimer = setInterval(() => {
    runDueJobs().catch((e) => console.error("runDueJobs failed", e));
  }, 30_000);
}
