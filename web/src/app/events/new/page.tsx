import { createEvent } from "@/app/actions";
import { GroupPicker } from "@/components/GroupPicker";
import { SlotEditor } from "@/components/SlotEditor";
import { SubmitButton } from "@/components/SubmitButton";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function NewEventPage({ searchParams }: PageProps<"/events/new">) {
  const sp = await searchParams;
  const user = await requireUser("/events/new");
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const defaultGroupId = typeof sp.group === "string" && groups.some((g) => g.id === sp.group) ? sp.group : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">調整を作成</h1>
        <p className="mt-1 text-sm text-muted">
          作成から1時間後に自動で判定します（すぐに判定することもできます）。
        </p>
      </div>
      <form action={createEvent} className="space-y-5">
        <section className="card">
          <GroupPicker groups={groups} defaultGroupId={defaultGroupId} />
        </section>
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
        <SubmitButton>作成する</SubmitButton>
      </form>
    </div>
  );
}
