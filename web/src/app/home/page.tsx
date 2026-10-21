import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, formatSlot } from "@/lib/time";

export default async function HomePage() {
  const user = await requireUser("/home");
  if (!user.onboarded) redirect("/onboarding");

  const memberships = await prisma.eventMember.findMany({
    where: { userId: user.id },
    include: { event: { include: { slots: true, members: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
  const active = memberships.filter((m) => m.event.status !== "CONFIRMED" && m.event.status !== "CANCELLED");
  const confirmed = memberships
    .filter((m) => m.event.status === "CONFIRMED")
    .map((m) => ({ m, slot: m.event.slots.find((s) => s.id === m.event.confirmedSlotId)! }))
    .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ホーム</h1>
        <Link href="/events/new" className="btn-primary">
          ＋ 調整を作成
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">参加中の調整</h2>
        {active.length === 0 && <p className="card text-sm text-muted">参加中の調整はありません。</p>}
        {active.map(({ event: e }) => {
          const isOrganizer = e.organizerId === user.id;
          const needsAction = isOrganizer && (e.status === "AWAITING_CHOICE" || e.status === "AWAITING_FALLBACK");
          return (
            <Link key={e.id} href={needsAction ? `/events/${e.id}/choose` : `/events/${e.id}`} className="card block hover:border-primary">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{e.title}</p>
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {isOrganizer ? "主催" : "参加"} ・ メンバー{e.members.length}人 ・ 候補
                {e.slots.filter((s) => s.round === e.round).length}件
                {e.status === "COLLECTING" && ` ・ ${formatDateTime(e.judgeAt)} に判定`}
              </p>
              {needsAction && (
                <p className="mt-2 text-sm font-semibold text-warn">
                  {e.status === "AWAITING_CHOICE" ? "枠を選んでください" : "決行・出し直し・中止を選んでください"}
                  {e.choiceDeadline && `（${formatDateTime(e.choiceDeadline)} まで）`} →
                </p>
              )}
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">グループ</h2>
          <Link href="/groups/new" className="text-sm text-primary">
            ＋ グループを作成
          </Link>
        </div>
        {groups.length === 0 && (
          <p className="card text-sm text-muted">
            グループはまだありません。グループを作って招待リンクを送るか、受け取った招待リンクから参加してください。
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="card block hover:border-primary">
              <p className="font-semibold">{g.name}</p>
              <p className="mt-1 text-xs text-muted">メンバー{g._count.members}人</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">確定済みの予定</h2>
        {confirmed.length === 0 && <p className="card text-sm text-muted">確定済みの予定はありません。</p>}
        {confirmed.map(({ m, slot }) => (
          <Link key={m.id} href={`/events/${m.eventId}`} className="card block hover:border-primary">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{m.event.title}</p>
              {m.attendance === "NOT_ATTENDING" ? (
                <span className="badge bg-ng-bg text-ng">不参加</span>
              ) : (
                <span className="badge bg-ok-bg text-ok">参加</span>
              )}
            </div>
            <p className="mt-1 text-sm">{formatSlot(slot.start, slot.end)}</p>
            <p className="text-xs text-muted">{m.event.meetingPlace}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
