import {
  API_SERVICES_USER_DATA_POLICY_URL,
  APP_NAME,
  GOOGLE_CONNECTIONS_URL,
  PRIVACY_UPDATED_AT,
  operator,
} from "@/lib/site";

export const metadata = { title: "プライバシーポリシー" };

// Google の審査の要件：Google のユーザーデータをどう取得・利用・保存・共有するかを書く。
// 実装と食い違わないよう、データの扱いを変えたら同じ PR でこのページと PRIVACY_UPDATED_AT を更新する
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all underline">
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  const op = operator();
  const missing = [!op.name && "OPERATOR_NAME", !op.email && "SUPPORT_EMAIL"].filter(Boolean);

  return (
    <article className="card space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">プライバシーポリシー</h1>
        <p className="text-xs text-muted">制定日：{PRIVACY_UPDATED_AT}</p>
      </header>

      {missing.length > 0 && (
        <p className="notice-warn" role="alert">
          運営者の情報が設定されていません（環境変数 {missing.join("・")}）。公開する前に設定してください。
        </p>
      )}

      <p className="text-sm leading-relaxed">
        {op.name ?? "運営者"}（以下「運営者」）は、日程調整サービス「{APP_NAME}」（以下「本サービス」）での利用者の情報の扱いを、次のとおり定めます。
      </p>

      <Section title="1. 取得する情報">
        <p className="font-medium">(1) Google アカウントでログインしたとき</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>名前、メールアドレス、プロフィール画像、Google アカウントの ID</li>
        </ul>
        <p className="font-medium">(2) Google カレンダーを連携したとき（連携は任意です）</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            読み取るもの：あなたが所有するメインのカレンダーにある、候補の日時の前後の予定の開始・終了日時、種類（終日の予定など）、状態（キャンセルされたか）、表示方法（「予定あり」か「空き時間」か）、招待への出欠の回答
          </li>
          <li>
            <strong>読み取らないもの：予定のタイトル・説明・場所・参加者</strong>
          </li>
          <li>書き込むもの：日程が確定した予定（調整のタイトル、集合場所、日時、本サービスの調整ページへのリンク）</li>
          <li>カレンダーにアクセスするための許可の情報（アクセストークン・リフレッシュトークン）</li>
        </ul>
        <p className="font-medium">(3) あなたが入力したもの</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>出発地点の名前と住所、移動手段、メール通知の設定</li>
          <li>グループ名、調整のタイトル、集合場所、候補の日時、候補ごとの〇×の回答</li>
        </ul>
        <p className="font-medium">(4) 本サービスの利用によって作られるもの</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>候補ごとの参加可否の判定結果と、集合場所までの移動時間</li>
          <li>本サービスが送ったメールの記録（宛先・件名・本文）</li>
          <li>ログイン状態を保つための Cookie</li>
        </ul>
      </Section>

      <Section title="2. 利用目的">
        <ul className="list-disc space-y-1 pl-5">
          <li>候補の日時に参加できるかを、カレンダーの空き状況と移動時間から判定するため</li>
          <li>確定した予定を、あなたの Google カレンダーに登録するため</li>
          <li>調整の作成・確定・選択の依頼などを、メールでお知らせするため</li>
          <li>不具合の調査と、不正な利用の防止のため</li>
        </ul>
        <p>
          Google カレンダーから読み取った予定の日時は、判定のためにその場で使うだけで、本サービスには保存しません。保存するのは判定結果（参加できるかどうか）です。
        </p>
      </Section>

      <Section title="3. ほかの利用者に表示する情報">
        <p>同じグループのメンバーには、あなたの名前と、候補ごとに参加できるかどうか、確定した予定への出欠だけを表示します。</p>
        <p>カレンダーの予定、移動時間、出発地点、メールアドレスは、ほかの利用者には表示しません。</p>
      </Section>

      <Section title="4. 外部のサービスに送る情報">
        <p>本サービスを提供するため、次の情報を外部のサービスに送ります。情報を販売したり、広告に使ったりすることはありません。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>移動時間の計算：出発地点の住所と集合場所を、経路検索のサービス（Google Routes API、NAVITIME（RapidAPI 経由）または駅すぱあと）に送ります</li>
          <li>メールの送信：メールアドレスとお知らせの内容を、メール送信のサービスに送ります</li>
          <li>データの保存：本サービスのデータは、運営者が契約するサーバーに保存します</li>
        </ul>
      </Section>

      <Section title="5. Google のユーザーデータの扱い">
        <p>
          本サービスが Google API から受け取った情報の利用と、ほかのアプリへの転送は、Limited Use（利用の制限）の要件を含む
          <ExternalLink href={API_SERVICES_USER_DATA_POLICY_URL}>Google API サービスのユーザーデータに関するポリシー</ExternalLink>
          に従います。
        </p>
        <p>
          Google のユーザーデータは、上の利用目的にある本サービスの機能のためだけに使います。広告、販売、信用の評価、AI モデルの学習には使いません。運営者が内容を読むのは、あなたの同意がある場合、不具合や不正の調査に必要な場合、法令に従う場合に限ります。
        </p>
      </Section>

      <Section title="6. 保存期間と削除">
        <ul className="list-disc space-y-1 pl-5">
          <li>取得した情報は、アカウントを削除するまで保存します。</li>
          <li>移動時間の計算結果は、同じ条件の計算に使い回すために保存します（出発地点と集合場所の住所を含みます）。</li>
          <li>
            カレンダーの連携は、設定画面の「連携を解除」でやめられます。このとき、本サービスに保存した許可の情報（トークン）を削除します。Google 側の許可は、Google アカウントの
            <ExternalLink href={GOOGLE_CONNECTIONS_URL}>サードパーティ製のアプリとサービス</ExternalLink>
            から取り消せます。
          </li>
          <li>アカウントとデータの削除を希望する場合は、下の問い合わせ先にご連絡ください。</li>
          <li>あなたの Google カレンダーに登録した予定は、カレンダーに残ります。不要な場合はカレンダーから削除してください。</li>
        </ul>
      </Section>

      <Section title="7. Cookie">
        <p>ログイン状態を保つため、また Google でのログインを安全に行うために Cookie を使います。広告や利用状況の分析のための Cookie は使いません。</p>
      </Section>

      <Section title="8. このポリシーの変更">
        <p>情報の扱いを変えるときは、このページを更新し、制定日（改定日）を書き換えます。</p>
      </Section>

      <Section title="9. 運営者と問い合わせ先">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">運営者</dt>
          <dd>{op.name ?? "（未設定）"}</dd>
          <dt className="text-muted">問い合わせ先</dt>
          <dd className="break-all">{op.email ?? "（未設定）"}</dd>
        </dl>
      </Section>

      <Section title="Summary in English">
        <p lang="en">
          {APP_NAME} reads only the start and end times, type, status, transparency and your response status of events on
          the primary Google Calendar you own, around the proposed dates, to decide whether you can attend. It never reads
          event titles, descriptions, locations or attendees, and does not store the events it reads. It writes only the
          confirmed event to your calendar. Other members see only whether you can attend.
        </p>
        <p lang="en">
          {APP_NAME}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <ExternalLink href={API_SERVICES_USER_DATA_POLICY_URL}>Google API Services User Data Policy</ExternalLink>,
          including the Limited Use requirements.
        </p>
      </Section>
    </article>
  );
}
