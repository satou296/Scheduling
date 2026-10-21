import Link from "next/link";
import { linkDevCalendar, unlinkCalendar } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";
import type { User } from "@prisma/client";

/** カレンダー連携の状態表示と連携ボタン（F-02） */
export function CalendarLink({ user, returnTo }: { user: User; returnTo: string }) {
  if (user.calendarLinked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="badge bg-ok-bg text-ok">連携済み{user.isDevUser ? "（モック）" : ""}</span>
        <form action={unlinkCalendar}>
          <SubmitButton className="btn-secondary">連携を解除</SubmitButton>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        連携すると、予定の空き／埋まりから自動で判定します。連携しない場合は、候補ごとに〇×を入力します。
      </p>
      {/* 画面内のプライバシーの説明（Google の審査の要件）。内容はプライバシーポリシーと一致させる */}
      <ul className="space-y-1 rounded-lg border border-border px-3 py-2 text-xs text-muted">
        <li>読み取るもの：あなたのカレンダーの予定の日時・種類・出欠の回答</li>
        <li>読み取らないもの：予定のタイトル・説明・場所・参加者</li>
        <li>書き込むもの：日程が確定した予定だけ</li>
        <li>
          ほかのメンバーに見えるのは参加できるかどうかだけです。詳しくは
          <Link href="/privacy" className="underline">
            プライバシーポリシー
          </Link>
          をご覧ください。
        </li>
      </ul>
      {user.isDevUser ? (
        <form action={linkDevCalendar}>
          <input type="hidden" name="path" value={returnTo} />
          <SubmitButton className="btn-primary">モックカレンダーを連携</SubmitButton>
        </form>
      ) : (
        <a className="btn-primary" href={`/api/auth/google/start?calendar=1&next=${encodeURIComponent(returnTo)}`}>
          Googleカレンダーを連携
        </a>
      )}
    </div>
  );
}
