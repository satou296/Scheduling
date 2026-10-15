import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { inviteUrl } from "@/lib/groups";
import { requireUser } from "@/lib/session";
import { formatDateTime, formatSlot } from "@/lib/time";

export default async function GroupPage({ params, searchParams }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/groups/${id}`);
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
      events: { include: { slots: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!group || !group.members.some((m) => m.userId === user.id)) notFound();
  const url = inviteUrl(group.inviteToken);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{group.name}</h1>
        <Link href={`/events/new?group=${group.id}`} className="btn-primary">
          ＋ このグループで調整を作成
        </Link>
      </div>

      {sp.created && (
        <p className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          グループを作成しました。招待リンクをメンバーに送ってください。
        </p>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">招待リンク</h2>
        <p className="text-xs text-muted">受け取った人はこのリンクからグループに参加します。</p>
        <div className="flex gap-2">
          <input readOnly value={url} className="input font-mono text-xs" aria-label="招待リンク" />
          <CopyButton text={url} />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">メンバー（{group.members.length}人）</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {group.members.map((m) => (
            <li key={m.id} className="badge border border-border bg-background">
              {m.user.name}
              {m.userId === group.ownerId && "（作成者）"}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">このグループの調整</h2>
        {group.events.length === 0 && <p className="card text-sm text-muted">まだ調整はありません。</p>}
        {group.events.map((e) => {
          const confirmed = e.slots.find((s) => s.id === e.confirmedSlotId);
          return (
            <Link key={e.id} href={`/events/${e.id}`} className="card block hover:border-primary">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{e.title}</p>
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {confirmed
                  ? formatSlot(confirmed.start, confirmed.end)
                  : e.status === "COLLECTING"
                    ? `${formatDateTime(e.judgeAt)} に判定`
                    : e.meetingPlace}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
