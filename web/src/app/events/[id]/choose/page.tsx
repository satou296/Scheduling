import { notFound, redirect } from "next/navigation";
import { chooseSlot, repropose } from "@/app/actions";
import { ResultsTable } from "@/components/ResultsTable";
import { SlotEditor } from "@/components/SlotEditor";
import { SubmitButton } from "@/components/SubmitButton";
import { loadEventView } from "@/lib/event-view";
import { requireUser } from "@/lib/session";
import { formatDateTime, formatSlot } from "@/lib/time";

export default async function ChoosePage({ params }: PageProps<"/events/[id]/choose">) {
  const { id } = await params;
  const user = await requireUser(`/events/${id}/choose`);
  const view = await loadEventView(id, user.id);
  if (!view) notFound();
  const { event, isOrganizer, summaries, lateMembers } = view;
  if (!isOrganizer || (event.status !== "AWAITING_CHOICE" && event.status !== "AWAITING_FALLBACK")) {
    redirect(`/events/${id}`);
  }
  const choose = chooseSlot.bind(null, id);

  if (event.status === "AWAITING_CHOICE") {
    const ok = summaries.filter((s) => s.allOk);
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">枠を選んでください</h1>
          <p className="mt-1 text-sm text-muted">
            {event.title}：全員が参加できる枠が {ok.length} つあります。
            {event.choiceDeadline && `${formatDateTime(event.choiceDeadline)} までに選ばない場合、最も早い枠で自動的に確定します。`}
          </p>
        </div>
        <form action={choose} className="card space-y-3">
          {ok.map(({ slot }, i) => (
            <label
              key={slot.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary"
            >
              <input type="radio" name="slotId" value={slot.id} required defaultChecked={i === 0} className="mt-1" />
              <span>
                <span className="block font-medium">{formatSlot(slot.start, slot.end)}</span>
                {lateMembers.length > 0 && (
                  <span className="block text-xs text-muted">
                    後から参加：
                    {lateMembers
                      .map((m) => `${m.name} ${m.results.find((r) => r.slotId === slot.id)?.available ? "〇" : "×"}`)
                      .join("、")}
                  </span>
                )}
              </span>
            </label>
          ))}
          <SubmitButton>この枠で確定する</SubmitButton>
        </form>
        <section className="card space-y-2">
          <h2 className="font-semibold">判定結果</h2>
          <ResultsTable view={view} highlight={ok.map((s) => s.slot.id)} />
        </section>
      </div>
    );
  }

  const ranked = [...summaries].sort(
    (a, b) => b.available - a.available || a.slot.start.getTime() - b.slot.start.getTime(),
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">全員が参加できる枠がありませんでした</h1>
        <p className="mt-1 text-sm text-muted">参加できる人が多い枠で決行するか、候補を出し直してください。</p>
      </div>
      <form action={choose} className="card space-y-3">
        <h2 className="font-semibold">この枠で決行する</h2>
        {ranked.map(({ slot, available, total }, i) => (
          <label
            key={slot.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary"
          >
            <input type="radio" name="slotId" value={slot.id} required defaultChecked={i === 0} />
            <span className="flex-1">{formatSlot(slot.start, slot.end)}</span>
            <span className="text-sm font-semibold">
              {available}/{total}人
            </span>
          </label>
        ))}
        <p className="text-xs text-muted">参加できないメンバーは「不参加」になります。</p>
        <SubmitButton>この枠で決行する</SubmitButton>
      </form>
      <form action={repropose.bind(null, id)} className="card space-y-3">
        <h2 className="font-semibold">候補を出し直す</h2>
        <p className="text-sm text-muted">新しい候補で募集をやり直します（1時間後に再判定）。</p>
        <SlotEditor />
        <SubmitButton className="btn-secondary">候補を出し直す</SubmitButton>
      </form>
      <section className="card space-y-2">
        <h2 className="font-semibold">判定結果</h2>
        <ResultsTable view={view} />
      </section>
    </div>
  );
}
