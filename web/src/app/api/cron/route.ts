import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs } from "@/lib/scheduler";

// 外部のcron（例：1分ごと）から呼び出す。アプリ内のタイマー（instrumentation.ts）と併用しても二重処理はしない
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runDueJobs();
  return NextResponse.json({ ok: true });
}
