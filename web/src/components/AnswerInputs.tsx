import type { Slot } from "@prisma/client";
import { formatSlot } from "@/lib/time";

/** 候補ごとの〇×入力（F-14） */
export function AnswerInputs({ slots, answers }: { slots: Slot[]; answers?: Record<string, boolean> }) {
  return (
    <ul className="space-y-2">
      {slots.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <span className="text-sm">{formatSlot(s.start, s.end)}</span>
          <span className="flex gap-2">
            <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-1 text-sm has-[:checked]:border-ok has-[:checked]:bg-ok-bg has-[:checked]:text-ok">
              <input type="radio" name={`answer_${s.id}`} value="yes" required defaultChecked={answers?.[s.id] === true} />〇
            </label>
            <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-1 text-sm has-[:checked]:border-ng has-[:checked]:bg-ng-bg has-[:checked]:text-ng">
              <input type="radio" name={`answer_${s.id}`} value="no" defaultChecked={answers?.[s.id] === false} />×
            </label>
          </span>
        </li>
      ))}
    </ul>
  );
}
