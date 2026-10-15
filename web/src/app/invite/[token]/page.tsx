import { notFound, redirect } from "next/navigation";
import { joinGroupByInvite } from "@/app/actions";
import { AnswerInputs } from "@/components/AnswerInputs";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { prisma } from "@/lib/db";
import { answerSlots, isJoinable } from "@/lib/groups";
import { requireUser } from "@/lib/session";
import { formatSlot } from "@/lib/time";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(`/invite/${token}`)}`);

  const group = await prisma.group.findUnique({
    where: { inviteToken: token },
    include: {
      owner: true,
      members: { include: { user: true } },
      events: { include: { slots: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!group) notFound();
  if (group.members.some((m) => m.userId === user.id)) redirect(`/groups/${group.id}`);

  const events = group.events.filter((e) => isJoinable(e));
  const action = joinGroupByInvite.bind(null, token);

  return (
    <div className="space-y-5">
      <div className="card space-y-2">
        <p className="text-xs text-muted">{group.owner.name} さんからの招待</p>
        <h1 className="text-xl font-bold">{group.name}</h1>
        <p className="text-sm text-muted">
          メンバー {group.members.length}人：{group.members.map((m) => m.user.name).join("、")}
        </p>
      </div>

      <form action={action} className="space-y-4">
        {events.length === 0 && (
          <p className="card text-sm text-muted">進行中の調整はありません。参加すると、次の調整から加わります。</p>
        )}
        {events.map((e) => {
          const slots = answerSlots(e);
          const confirmed = e.status === "CONFIRMED";
          return (
            <section key={e.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{e.title}</h2>
                <StatusBadge status={e.status} />
              </div>
              <p className="text-sm">集合場所：{e.meetingPlace}</p>
              {confirmed && (
                <p className="text-sm text-muted">
                  予定は確定済みです。参加すると、この日時に参加できるかを判定し、参加できる場合は参加者に追加されます。
                </p>
              )}
              {user.calendarLinked ? (
                <>
                  <ul className="space-y-1 text-sm">
                    {slots.map((s) => (
                      <li key={s.id}>・{formatSlot(s.start, s.end)}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">Googleカレンダーの空き状況と移動時間から自動で判定します。</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">候補ごとに〇×を入力してください</p>
                  <AnswerInputs slots={slots} />
                </>
              )}
            </section>
          );
        })}
        {!user.calendarLinked && events.length > 0 && (
          <p className="text-xs text-muted">カレンダーを連携すると入力は不要になります（設定から連携できます）。</p>
        )}
        <SubmitButton>このグループに参加する</SubmitButton>
      </form>
    </div>
  );
}
