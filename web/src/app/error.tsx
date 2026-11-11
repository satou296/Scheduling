"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 予期しないエラーのときの画面。入力の誤りなど理由を見せるエラーは ActionForm がフォームの下に表示する。
 * 本番ではエラーの文章は届かないので、サーバーのログと照らし合わせるための ID（digest）だけを表示する
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card space-y-3">
      <h1 className="text-xl font-bold">問題が発生しました</h1>
      <p className="text-sm text-muted">
        時間をおいてもう一度お試しください。解決しない場合は、下のエラーIDを添えて運営者にお知らせください。
      </p>
      {error.digest && <p className="text-xs text-muted">エラーID：{error.digest}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => retry()}>
          もう一度試す
        </button>
        <Link href="/home" className="btn-secondary">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
