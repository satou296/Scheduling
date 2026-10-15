"use client";

import { useState } from "react";

type Row = { key: number; date: string; start: string; end: string };

/** 候補枠（日付・開始時刻・終了時刻）を複数入力するフォーム部品。name="slot_date" などで送信される */
export function SlotEditor() {
  const [rows, setRows] = useState<Row[]>([{ key: 0, date: "", start: "", end: "" }]);
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-2 sm:grid-cols-[3rem_1fr_7.5rem_7.5rem_auto]">
          <span className="col-span-2 text-sm text-muted sm:col-span-1 sm:pb-2">候補{i + 1}</span>
          <label className="col-span-2 sm:col-span-1">
            <span className="text-xs text-muted">日付</span>
            <input
              type="date"
              name="slot_date"
              required
              className="input"
              value={r.date}
              onChange={(e) => update(r.key, { date: e.target.value })}
            />
          </label>
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
              className="btn-secondary col-span-2 px-3 sm:col-span-1"
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
            return [...rs, { key: Date.now(), date: last?.date ?? "", start: last?.start ?? "", end: last?.end ?? "" }];
          })
        }
      >
        ＋ 候補を追加
      </button>
    </div>
  );
}
