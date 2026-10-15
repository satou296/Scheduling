import { createGroup } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/session";

export default async function NewGroupPage() {
  await requireUser("/groups/new");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">グループを作成</h1>
        <p className="mt-1 text-sm text-muted">
          作成すると招待リンクが発行されます。同じグループで何度でも日程調整ができます。
        </p>
      </div>
      <form action={createGroup} className="card space-y-4">
        <label className="block">
          <span className="label">グループ名</span>
          <input name="name" className="input" placeholder="例：大学の友達" required />
        </label>
        <SubmitButton>作成して招待リンクを発行</SubmitButton>
      </form>
    </div>
  );
}
