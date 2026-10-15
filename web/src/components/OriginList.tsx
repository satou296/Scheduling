import type { Origin } from "@prisma/client";
import { addOrigin, deleteOrigin, setDefaultOrigin } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";

/** 出発地点の一覧・追加・標準の切り替え（F-03） */
export function OriginList({ origins, path }: { origins: Origin[]; path: string }) {
  return (
    <div className="space-y-3">
      {origins.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {origins.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {o.label} {o.isDefault && <span className="badge ml-1 bg-primary text-primary-fg">標準</span>}
                </p>
                <p className="truncate text-xs text-muted">{o.address}</p>
              </div>
              {!o.isDefault && (
                <form action={setDefaultOrigin}>
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton className="btn-secondary px-3 py-1 text-xs">標準にする</SubmitButton>
                </form>
              )}
              <form action={deleteOrigin}>
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton className="btn-danger px-3 py-1 text-xs">削除</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addOrigin} className="flex flex-wrap gap-2">
        <input type="hidden" name="path" value={path} />
        <input name="label" className="input w-28" placeholder="名称（自宅）" />
        <input name="address" className="input min-w-48 flex-1" placeholder="住所（例：東京都渋谷区…）" required />
        <SubmitButton className="btn-secondary">追加</SubmitButton>
      </form>
    </div>
  );
}
