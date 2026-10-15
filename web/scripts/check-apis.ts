/**
 * 外部 API の接続確認（APIキーを .env に設定したあとに実行する）。
 *   npm run check:apis
 * 各 API に1回ずつ問い合わせて、設定どおり動くかを表示する。Google Routes は月間上限のカウントにも含める。
 */
import { getBusy } from "../src/lib/calendar";
import { prisma } from "../src/lib/db";
import { googleConfigured } from "../src/lib/google-oauth";
import { verifySmtp } from "../src/lib/mail";
import { reserveGoogleQuota, roadProvider, transitProvider } from "../src/lib/routes";
import { MockRouteProvider } from "../src/lib/routes/mock";
import { addMinutes } from "../src/lib/time";

type Status = "OK" | "NG" | "未設定";
const results: { name: string; status: Status; detail: string }[] = [];

async function check(name: string, fn: () => Promise<{ status: Status; detail: string }>) {
  try {
    results.push({ name, ...(await fn()) });
  } catch (e) {
    results.push({ name, status: "NG", detail: e instanceof Error ? e.message : String(e) });
  }
}

const ORIGIN = "東京都新宿区西新宿2-8-1";
const DESTINATION = "東京都渋谷区道玄坂2-1";
const at = addMinutes(new Date(), 24 * 60);

async function main() {
  await check("Google OAuth（ログイン）", async () =>
    googleConfigured()
      ? { status: "OK", detail: "設定あり。実際の確認は /login から Google でログインしてください" }
      : { status: "未設定", detail: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
  );

  await check("Google Calendar（FreeBusy）", async () => {
    const user = await prisma.user.findFirst({ where: { calendarLinked: true, isDevUser: false } });
    if (!user) return { status: "未設定", detail: "カレンダー連携済みのユーザーがいません（ログイン後に連携してから再実行）" };
    const busy = await getBusy(user.id, new Date(), at);
    return busy
      ? { status: "OK", detail: `${user.email}：今後24時間の埋まり ${busy.length}件` }
      : { status: "NG", detail: `${user.email} の FreeBusy を取得できません（サーバーログを確認）` };
  });

  await check("Google Routes（車・徒歩・自転車）", async () => {
    const p = roadProvider();
    if (p instanceof MockRouteProvider) return { status: "未設定", detail: "GOOGLE_ROUTES_API_KEY" };
    if (!(await reserveGoogleQuota())) return { status: "NG", detail: "アプリ側の月間上限に達しています" };
    const r = await p.compute({ origin: ORIGIN, destination: DESTINATION, mode: "DRIVE", direction: "outbound", time: at });
    return r.ok ? { status: "OK", detail: `車で ${r.minutes}分` } : { status: "NG", detail: r.reason };
  });

  await check("電車・バス", async () => {
    const p = transitProvider();
    if (p instanceof MockRouteProvider) {
      return { status: "未設定", detail: "RAPIDAPI_KEY + RAPIDAPI_NAVITIME_HOST、または EKISPERT_API_KEY" };
    }
    const r = await p.compute({ origin: ORIGIN, destination: DESTINATION, mode: "TRANSIT", direction: "outbound", time: at });
    return r.ok ? { status: "OK", detail: `${p.name}：${r.minutes}分` } : { status: "NG", detail: `${p.name}：${r.reason}` };
  });

  await check("メール（SMTP）", async () => {
    const ok = await verifySmtp();
    return ok === null ? { status: "未設定", detail: "SMTP_HOST" } : { status: "OK", detail: "接続・認証に成功" };
  });

  await check("開発者への通知先", async () =>
    process.env.DEVELOPER_EMAIL
      ? { status: "OK", detail: process.env.DEVELOPER_EMAIL }
      : { status: "未設定", detail: "DEVELOPER_EMAIL（利用上限の通知先）" },
  );

  for (const r of results) console.log(`${r.status.padEnd(4, "　")} ${r.name}：${r.detail}`);
  await prisma.$disconnect();
  process.exit(results.some((r) => r.status === "NG") ? 1 : 0);
}

void main();
