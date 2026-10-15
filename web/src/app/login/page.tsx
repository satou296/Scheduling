import { redirect } from "next/navigation";
import { devLogin } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { googleConfigured } from "@/lib/google-oauth";
import { devLoginEnabled, getCurrentUser, safeNext } from "@/lib/session";
import { SESSION_SECRET_FIX, sessionSecretProblem } from "@/lib/session-secret";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);

  // 署名鍵がないとログインできない（セッションCookieを作れない）ので、操作する前に直し方を示す
  const secretProblem = sessionSecretProblem(process.env.SESSION_SECRET);
  if (secretProblem) {
    return (
      <div className="mx-auto max-w-sm space-y-6 pt-8">
        <h1 className="text-center text-2xl font-bold">スケジュール調整</h1>
        <div className="notice-warn space-y-2" role="alert">
          <p className="font-semibold">サーバーの設定が完了していないため、ログインできません。</p>
          <p>{secretProblem}</p>
          <p>{SESSION_SECRET_FIX}</p>
        </div>
      </div>
    );
  }

  if (await getCurrentUser()) redirect(next);

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">スケジュール調整</h1>
        <p className="mt-2 text-sm text-muted">候補を入れるだけで、みんなの予定を自動で決めます。</p>
      </div>

      {sp.error && <p className="notice-warn">ログインに失敗しました。もう一度お試しください。</p>}

      <div className="card space-y-3">
        {googleConfigured() ? (
          <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="btn-primary w-full">
            Googleアカウントでログイン
          </a>
        ) : (
          <p className="text-sm text-muted">
            Googleログインは未設定です（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）。
          </p>
        )}
      </div>

      {devLoginEnabled() && (
        <form action={devLogin} className="card space-y-3">
          <p className="text-sm font-semibold">開発用ログイン</p>
          <p className="text-xs text-muted">
            Googleなしで動作確認できます。同じ名前で入ると同じユーザーになります。カレンダーはモックです。
          </p>
          <input type="hidden" name="next" value={next} />
          <input name="name" className="input" placeholder="名前（例：たろう）" required />
          <SubmitButton className="btn-secondary w-full">開発用ユーザーでログイン</SubmitButton>
        </form>
      )}
    </div>
  );
}
