"use client";

import { useState } from "react";
import { DateFields } from "@/components/DateFields";
import { EMPTY_DATE_PARTS, type DateParts } from "@/lib/date-parts";

type Row = { key: number; date: DateParts; start: string; end: string };

/** 候補枠（日付・開始時刻・終了時刻）を複数入力するフォーム部品。name="slot_date" などで送信される */
export function SlotEditor() {
  const [rows, setRows] = useState<Row[]>([{ key: 0, date: EMPTY_DATE_PARTS, start: "", end: "" }]);
  const update = (key: number, patch: Partial<Omit<Row, "date">>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateDate = (key: number, patch: Partial<DateParts>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, date: { ...r.date, ...patch } } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-2 md:grid-cols-[3rem_auto_7.5rem_7.5rem_auto]">
          <span className="col-span-2 text-sm text-muted md:col-span-1 md:pb-2">候補{i + 1}</span>
          <div className="col-span-2 md:col-span-1">
            <span id={`slot-date-${r.key}`} className="text-xs text-muted">
              日付
            </span>
            <DateFields
              name="slot_date"
              labelId={`slot-date-${r.key}`}
              value={r.date}
              onChange={(patch) => updateDate(r.key, patch)}
            />
          </div>
          <label>
            <span className="text-xs text-muted">開始</span>
            <input
              type="time"
              name="slot_start"
              required
              className="input"
              value={r.start}
              onChange={(e) => update(r.key, { start: e.target.value })}
            />
          </label>
          <label>
            <span className="text-xs text-muted">終了</span>
            <input
              type="time"
              name="slot_end"
              required
              className="input"
              value={r.end}
              onChange={(e) => update(r.key, { end: e.target.value })}
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              className="btn-secondary col-span-2 px-3 md:col-span-1"
              aria-label={`候補${i + 1}を削除`}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            >
              削除
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        onClick={() =>
          setRows((rs) => {
            const last = rs[rs.length - 1];
            return [
              ...rs,
              { key: Date.now(), date: last?.date ?? EMPTY_DATE_PARTS, start: last?.start ?? "", end: last?.end ?? "" },
            ];
          })
        }
      >
        ＋ 候補を追加
      </button>
    </div>
  );
}
