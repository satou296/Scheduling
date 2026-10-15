import { createEvent } from "@/app/actions";
import { SlotEditor } from "@/components/SlotEditor";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/session";

export default async function NewEventPage() {
  await requireUser("/events/new");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">調整を作成</h1>
        <p className="mt-1 text-sm text-muted">
          作成すると招待リンクが発行されます。作成から1時間後に自動で判定します（すぐに判定することもできます）。
        </p>
      </div>
      <form action={createEvent} className="space-y-5">
        <section className="card space-y-4">
          <label className="block">
            <span className="label">タイトル</span>
            <input name="title" className="input" placeholder="例：週末ボウリング" required />
          </label>
          <label className="block">
            <span className="label">集合場所</span>
            <input name="meetingPlace" className="input" placeholder="例：渋谷駅 ハチ公前" required />
          </label>
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">候補枠</h2>
          <SlotEditor />
        </section>
        <SubmitButton>作成して招待リンクを発行</SubmitButton>
      </form>
    </div>
  );
}
