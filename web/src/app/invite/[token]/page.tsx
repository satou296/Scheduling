import { notFound, redirect } from "next/navigation";
import { joinEvent } from "@/app/actions";
import { AnswerInputs } from "@/components/AnswerInputs";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatSlot } from "@/lib/time";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(`/invite/${token}`)}`);

  const event = await prisma.event.findUnique({
    where: { inviteToken: token },
    include: { organizer: true, slots: true, members: true },
  });
  if (!event || event.status === "CANCELLED") notFound();
  if (event.members.some((m) => m.userId === user.id)) redirect(`/events/${event.id}`);

  const slots = event.slots
    .filter((s) => s.round === event.round)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const confirmed = event.slots.find((s) => s.id === event.confirmedSlotId);
  const action = joinEvent.bind(null, token);

  return (
    <div className="space-y-5">
      <div className="card space-y-2">
        <p className="text-xs text-muted">{event.organizer.name} さんからの招待</p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="text-sm">集合場所：{event.meetingPlace}</p>
        <p className="text-sm text-muted">メンバー {event.members.length}人</p>
      </div>

      <form action={action} className="card space-y-4">
        {confirmed ? (
          <p className="text-sm">
            予定はすでに <b>{formatSlot(confirmed.start, confirmed.end)}</b> に確定しています。
            参加すると、この日時に参加できるかを判定し、参加できる場合は参加者に追加されます。
          </p>
        ) : user.calendarLinked ? (
          <>
            <h2 className="font-semibold">候補</h2>
            <ul className="space-y-1 text-sm">
              {slots.map((s) => (
                <li key={s.id}>・{formatSlot(s.start, s.end)}</li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Googleカレンダーの空き状況と移動時間から、自動で参加可否を判定します。
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold">候補ごとに〇×を入力してください</h2>
            <AnswerInputs slots={slots} />
            <p className="text-xs text-muted">カレンダーを連携すると入力は不要になります（設定から連携できます）。</p>
          </>
        )}
        {confirmed && !user.calendarLinked && (
          <>
            <AnswerInputs slots={[confirmed]} />
          </>
        )}
        <SubmitButton>この調整に参加する</SubmitButton>
      </form>
    </div>
  );
}
