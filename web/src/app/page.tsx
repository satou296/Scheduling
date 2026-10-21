import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { googleConfigured } from "@/lib/google-oauth";
import { getCurrentUser } from "@/lib/session";
import { APP_NAME } from "@/lib/site";

const STEPS = [
  { title: "候補を入れる", body: "主催者が、候補の日時と集合場所を入れて、グループの招待リンクを送ります。" },
  {
    title: "自動で判定",
    body: "メンバーの Google カレンダーの空き状況と、集合場所までの移動時間から、参加できるかを判定します。",
  },
  { title: "予定が決まる", body: "全員が参加できる枠で確定し、それぞれの Google カレンダーに登録します。" },
];

const PRIVACY_POINTS = [
  "カレンダーから読み取るのは予定の日時だけで、タイトルや場所などの内容は読み取りません。",
  "ほかのメンバーに見えるのは、参加できるかどうかだけです。移動時間や出発地点は本人にしか表示しません。",
  "カレンダーを連携しなくても、候補ごとに〇×を入力して参加できます。",
];

// ログインしていない人にも見せるトップページ（Google の審査の要件：アプリの説明とプライバシーポリシーへのリンク）
export default async function Root() {
  if (await getCurrentUser()) redirect("/home");

  return (
    <div className="space-y-8 py-4">
      <section className="space-y-4 text-center">
        <h1 className="text-3xl font-bold">{APP_NAME}</h1>
        <p className="text-muted">候補の日時を入れるだけで、友だちとの予定を自動で決めます。</p>
        <div className="flex justify-center">
          {googleConfigured() ? (
            <GoogleSignInButton href="/api/auth/google/start?next=%2Fhome" />
          ) : (
            <Link href="/login" className="btn-primary">
              ログイン
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">使い方</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card space-y-1">
              <p className="text-sm font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">予定の中身は見ません</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {PRIVACY_POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/privacy" className="underline">
            プライバシーポリシー
          </Link>
        </p>
      </section>
    </div>
  );
}
