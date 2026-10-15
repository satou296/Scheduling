import type { EventView } from "@/lib/event-view";
import { formatSlot } from "@/lib/time";

function Mark({ ok, approx }: { ok: boolean | undefined; approx?: boolean }) {
  if (ok === undefined) return <span className="text-muted">−</span>;
  return (
    <span className={ok ? "font-bold text-ok" : "font-bold text-ng"} title={approx ? "移動時間は未計算" : undefined}>
      {ok ? "〇" : "×"}
      {approx && <sup>*</sup>}
    </span>
  );
}

/** 枠ごとの参加可否と参加可能人数 */
export function ResultsTable({ view, highlight }: { view: EventView; highlight?: string[] }) {
  const cols = [...view.judgedMembers, ...view.lateMembers];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">候補</th>
            <th className="px-2 py-2 font-medium">参加可能</th>
            {cols.map((m) => (
              <th key={m.id} className="px-2 py-2 text-center font-medium">
                {m.name}
                {view.lateMembers.includes(m) && <span className="block text-[10px]">（後から参加）</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.summaries.map(({ slot, available, total, allOk }) => (
            <tr
              key={slot.id}
              className={`border-b border-border ${highlight?.includes(slot.id) ? "bg-ok-bg" : ""}`}
            >
              <td className="py-2 pr-3 whitespace-nowrap">{formatSlot(slot.start, slot.end)}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                <span className={allOk ? "font-bold text-ok" : ""}>
                  {available}/{total}人{allOk && " 全員OK"}
                </span>
              </td>
              {cols.map((m) => {
                const r = m.results.find((x) => x.slotId === slot.id);
                return (
                  <td key={m.id} className="px-2 py-2 text-center">
                    <Mark ok={r?.available} approx={r ? !r.travelComputed : false} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
