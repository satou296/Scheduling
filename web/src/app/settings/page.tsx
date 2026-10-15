import Link from "next/link";
import { addDevBusy, deleteDevBusy, updateSettings } from "@/app/actions";
import { CalendarLink } from "@/components/CalendarLink";
import { OriginList } from "@/components/OriginList";
import { SubmitButton } from "@/components/SubmitButton";
import { TravelModeSelect } from "@/components/TravelModeSelect";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatSlot } from "@/lib/time";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const user = await requireUser("/settings");
  const origins = await prisma.origin.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const devEvents = user.isDevUser
    ? await prisma.devCalendarEvent.findMany({ where: { userId: user.id }, orderBy: { start: "asc" } })
    : [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">設定</h1>
      {sp.calendar === "denied" && (
        <p className="notice-warn">カレンダーの権限が許可されませんでした。</p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Googleカレンダー連携</h2>
        <CalendarLink user={user} returnTo="/settings" />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">出発地点</h2>
        <p className="text-sm text-muted">「標準」の地点から集合場所までの移動時間で判定します。</p>
        <OriginList origins={origins} path="/settings" />
      </section>

      <form action={updateSettings} className="card space-y-4">
        <div className="space-y-2">
          <h2 className="font-semibold">移動手段</h2>
          <TravelModeSelect value={user.travelMode} />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">通知</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} />
            メールで通知を受け取る（{user.email}）
          </label>
        </div>
        <SubmitButton className="btn-secondary">保存</SubmitButton>
      </form>

      {user.isDevUser && (
        <section className="card space-y-3 border-dashed">
          <h2 className="font-semibold">モックカレンダー（開発用）</h2>
          <p className="text-xs text-muted">ここに入れた予定が「埋まり」として判定に使われます。確定した予定もここに書き込まれます。</p>
          <ul className="space-y-1 text-sm">
            {devEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span>
                  {formatSlot(e.start, e.end)} {e.title}
                </span>
                <form action={deleteDevBusy}>
                  <input type="hidden" name="id" value={e.id} />
                  <SubmitButton className="btn-danger px-2 py-0.5 text-xs">削除</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={addDevBusy} className="flex flex-wrap items-end gap-2">
            <input name="title" className="input w-28" placeholder="予定名" />
            <input type="datetime-local" name="start" className="input w-auto" required />
            <input type="datetime-local" name="end" className="input w-auto" required />
            <SubmitButton className="btn-secondary">追加</SubmitButton>
          </form>
          <Link href="/dev/mails" className="text-sm text-primary underline">
            送信メールの確認 →
          </Link>
        </section>
      )}
    </div>
  );
}
