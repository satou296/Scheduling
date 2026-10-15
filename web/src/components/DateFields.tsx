"use client";

import { useEffect, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  fromIsoDate,
  nextPartValue,
  padPart,
  parseDateText,
  partError,
  shouldAdvance,
  toIsoDate,
  type DatePart,
  type DateParts,
} from "@/lib/date-parts";

const PARTS: { part: DatePart; label: string; width: string }[] = [
  { part: "y", label: "年", width: "w-[4.5rem]" },
  { part: "m", label: "月", width: "w-[3.25rem]" },
  { part: "d", label: "日", width: "w-[3.25rem]" },
];

/**
 * 日付を「年・月・日」の3つの欄で入力する部品。年を4桁・月を2桁入力すると次の欄へ移る。
 * ブラウザ標準の日付欄（type="date"）は欄の移動をページ側で制御できず、Chrome では年に6桁まで入るため自前で作っている。
 * 送信される値は name の hidden 欄に "YYYY-MM-DD" で入る。カレンダーから選ぶこともできる。
 */
export function DateFields({
  name,
  value,
  onChange,
  labelId,
}: {
  name: string;
  value: DateParts;
  /** 変更された欄だけを渡す（欄の移動中に古い値で上書きしないよう、呼び出し側で最新の値にまとめる） */
  onChange: (patch: Partial<DateParts>) => void;
  labelId: string;
}) {
  const refs = { y: useRef<HTMLInputElement>(null), m: useRef<HTMLInputElement>(null), d: useRef<HTMLInputElement>(null) };
  const pickerRef = useRef<HTMLInputElement>(null);
  const iso = toIsoDate(value);

  // 入力ミスはブラウザの検証メッセージで知らせ、送信を止める
  useEffect(() => {
    for (const { part } of PARTS) refs[part].current?.setCustomValidity(partError(part, value) ?? "");
  });

  const focusPart = (part: DatePart) => {
    const el = refs[part].current;
    if (!el) return;
    el.focus();
    el.select(); // 入力済みの欄（「候補を追加」でコピーされた日付など）も、そのまま打てば上書きできるようにする
  };

  const handleChange = (part: DatePart, e: ChangeEvent<HTMLInputElement>) => {
    const v = nextPartValue(part, value[part], e.target.value, e.target.selectionStart);
    onChange({ [part]: v });
    if (shouldAdvance(part, v)) focusPart(part === "y" ? "m" : "d");
  };

  // 「2026-11-08」のような日付を貼り付けたら、3つの欄にまとめて入れる
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const parts = parseDateText(e.clipboardData.getData("text"));
    if (!parts) return;
    e.preventDefault();
    onChange(parts);
    refs.d.current?.focus();
  };

  // 空の欄で Backspace を押したら前の欄へ戻る
  const handleKeyDown = (part: DatePart, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace" || value[part] !== "" || part === "y") return;
    e.preventDefault();
    const prev = part === "d" ? "m" : "y";
    refs[prev].current?.focus();
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} className="relative flex items-center gap-1">
      {PARTS.map(({ part, label, width }) => (
        <span key={part} className="flex items-center gap-1">
          <span className={width}>
            <input
              ref={refs[part]}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              required
              aria-label={label}
              className="input px-2 text-center tabular-nums"
              value={value[part]}
              onChange={(e) => handleChange(part, e)}
              onPaste={handlePaste}
              onKeyDown={(e) => handleKeyDown(part, e)}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                const padded = padPart(part, v);
                if (padded !== v) onChange({ [part]: padded });
              }}
            />
          </span>
          <span className="text-sm text-muted">{label}</span>
        </span>
      ))}
      <button
        type="button"
        className="btn-secondary ml-1 shrink-0 px-2"
        aria-label="カレンダーから選ぶ"
        title="カレンダーから選ぶ"
        onClick={openPicker}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {/* カレンダー表示用のブラウザ標準の日付欄（見えない位置に置き、ボタンから開く） */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
        value={iso ?? ""}
        onChange={(e) => {
          if (e.target.value) onChange(fromIsoDate(e.target.value));
        }}
      />
      <input type="hidden" name={name} value={iso ?? ""} />
    </div>
  );
}
