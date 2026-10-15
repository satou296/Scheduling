import Link from "next/link";
import { notFound } from "next/navigation";
import { judgeNow, saveAnswers } from "@/app/actions";
import { AnswerInputs } from "@/components/AnswerInputs";
import { CopyButton } from "@/components/CopyButton";
import { ResultsTable } from "@/components/ResultsTable";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { prisma } from "@/lib/db";
import { loadEventView } from "@/lib/event-view";
import { inviteUrl as groupInviteUrl } from "@/lib/groups";
import { googleCalendarAddUrl } from "@/lib/ics";
import { TRAVEL_UNCOMPUTED_NOTICE, judgeEvent } from "@/lib/scheduler";
import { requireUser } from "@/lib/session";
import { formatDateTime, formatSlot } from "@/lib/time";

export default async function EventPage({ params, searchParams }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/events/${id}`);
  // 判定時刻を過ぎていれば、表示する前にその場で判定する（判定の速さ）
  const pending = await prisma.event.findUnique({ where: { id }, select: { status: true, judgeAt: true } });
  if (pending?.status === "COLLECTING" && pending.judgeAt <= new Date()) {
    await judgeEvent(id).catch((e) => console.error("judgeEvent (on view) failed", e));
  }
  const view = await loadEventView(id, user.id);
  if (!view) notFound();
  const { event, me, isOrganizer, slots, members, confirmedSlot } = view;
  const inviteUrl = groupInviteUrl(event.group.inviteToken);
  const collecting = event.status === "COLLECTING";
  const awaiting = event.status === "AWAITING_CHOICE" || event.status === "AWAITING_FALLBACK";
  const myResults = view.members.find((m) => m.id === me.id)?.results ?? [];

  return (
    <div className="space-y-5">
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="text-sm">集合場所：{event.meetingPlace}</p>
        <p className="text-xs text-muted">
          <Link href={`/groups/${event.groupId}`} className="underline">
            {event.group.name}
          </Link>
          ・主催：{event.organizer.name}
        </p>
      </div>

      {sp.created && (
        <p className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          調整を作成しました。招待リンクをメンバーに送ってください。
        </p>
      )}

      {event.status !== "CONFIRMED" && (
        <section className="card space-y-2">
          <h2 className="font-semibold">グループの招待リンク</h2>
          <div className="flex gap-2">
            <input readOnly value={inviteUrl} className="input min-w-0 font-mono text-xs" />
            <CopyButton text={inviteUrl} />
          </div>
        </section>
      )}

      {event.status === "CONFIRMED" && confirmedSlot && (
        <section className="card space-y-3 border-ok">
          <h2 className="font-semibold text-ok">予定が確定しました</h2>
          <p className="text-lg font-bold">{formatSlot(confirmedSlot.start, confirmedSlot.end)}</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {members.map((m) => (
              <li
                key={m.id}
                className={`badge ${m.attendance === "ATTENDING" ? "bg-ok-bg text-ok" : "bg-ng-bg text-ng"}`}
              >
                {m.name}：{m.attendance === "ATTENDING" ? "参加" : m.attendance === "NOT_ATTENDING" ? "不参加" : "判定中"}
              </li>
            ))}
          </ul>
          {me.attendance === "ATTENDING" && me.calendarEventId && (
            <p className="text-xs text-muted">あなたのGoogleカレンダーに登録済みです。</p>
          )}
          {me.attendance === "ATTENDING" && !me.calendarEventId && (
            <div className="flex flex-wrap gap-2">
              <a
                className="btn-secondary"
                target="_blank"
                rel="noopener noreferrer"
                href={googleCalendarAddUrl({
                  id: event.id,
                  title: event.title,
                  location: event.meetingPlace,
                  description: `${process.env.APP_URL}/events/${event.id}`,
                  start: confirmedSlot.start,
                  end: confirmedSlot.end,
                })}
              >
                Googleカレンダーに追加
              </a>
              <a className="btn-secondary" href={`/events/${event.id}/ics`}>
                .ics をダウンロード
              </a>
            </div>
          )}
        </section>
      )}

      {awaiting && (
        <section className="card space-y-2 border-warn">
          {isOrganizer ? (
            <>
              <p className="text-sm font-semibold text-warn">
                {event.status === "AWAITING_CHOICE"
                  ? `全員が参加できる枠が複数あります。${event.choiceDeadline ? formatDateTime(event.choiceDeadline) : ""} までに選んでください。`
                  : "全員が参加できる枠がありませんでした。決行するか、候補を出し直すかを選んでください。"}
              </p>
              <Link href={`/events/${event.id}/choose`} className="btn-primary">
                枠を選ぶ
              </Link>
            </>
          ) : (
            <p className="text-sm">主催者が枠を選んでいます。確定したらメールでお知らせします。</p>
          )}
        </section>
      )}

      {event.travelUncomputed && !collecting && <p className="notice-warn">＊{TRAVEL_UNCOMPUTED_NOTICE}</p>}

      {collecting ? (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">募集中</h2>
              <p className="text-sm text-muted">{formatDateTime(event.judgeAt)} に自動で判定します。</p>
            </div>
            {isOrganizer && (
              <form action={judgeNow.bind(null, event.id)}>
                <SubmitButton pendingText="判定中…">今すぐ判定</SubmitButton>
              </form>
            )}
          </div>
          <h3 className="pt-2 text-sm font-semibold">候補</h3>
          <ul className="space-y-1 text-sm">
            {slots.map((s) => (
              <li key={s.id}>・{formatSlot(s.start, s.end)}</li>
            ))}
          </ul>
          <h3 className="pt-2 text-sm font-semibold">メンバー（{members.length}人）</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {members.map((m) => (
              <li key={m.id} className="badge border border-border bg-background">
                {m.name}
                {m.isOrganizer && "（主催）"}・
                {m.calendarLinked ? "カレンダー" : m.answered ? "〇×回答済み" : "〇×未回答"}
              </li>
            ))}
          </ul>
        </section>
      ) : event.status === "JUDGING" ? (
        <p className="card text-sm">判定中です…</p>
      ) : (
        <section className="card space-y-3">
          <h2 className="font-semibold">判定結果</h2>
          <ResultsTable view={view} highlight={confirmedSlot ? [confirmedSlot.id] : undefined} />
          {event.judgedAt && <p className="text-xs text-muted">判定日時：{formatDateTime(event.judgedAt)}</p>}
          {myResults.some((r) => r.outboundMin !== null) && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">あなたの移動時間（あなたにだけ表示）</summary>
              <ul className="mt-2 space-y-1">
                {myResults.map((r) => {
                  const s = event.slots.find((x) => x.id === r.slotId);
                  if (!s || r.outboundMin === null) return null;
                  return (
                    <li key={r.id}>
                      {formatSlot(s.start, s.end)}：行き {r.outboundMin}分 / 帰り {r.returnMin ?? "?"}分
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>
      )}

      {collecting && !user.calendarLinked && (
        <form action={saveAnswers.bind(null, event.id)} className="card space-y-3">
          <h2 className="font-semibold">あなたの〇×</h2>
          <AnswerInputs slots={slots} answers={view.myAnswers} />
          <SubmitButton className="btn-secondary">回答を保存</SubmitButton>
        </form>
      )}
    </div>
  );
}
