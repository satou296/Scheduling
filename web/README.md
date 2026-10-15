# スケジュール調整アプリ（Web版）

要件定義書（`../スケジュール調整アプリ 要件定義書 (1).md`）のフェーズ1（F-01〜F-31）の実装です。

- Next.js 16（App Router / Server Actions）+ TypeScript + Tailwind CSS v4
- Prisma 6 + SQLite（本番は PostgreSQL などに `provider` を変更可）
- Google OAuth（ログイン・カレンダー連携）、Google Calendar FreeBusy / Events API
- 経路検索：Google Routes API（車・徒歩・自転車）、NAVITIME totalnavi via RapidAPI（電車・バス）
- メール：SMTP（nodemailer）

## 起動

```bash
cp .env.example .env    # SESSION_SECRET を変更
npm install
npm run db:push
npm run dev             # http://localhost:3000
npm test                # 判定ロジック・スケジューラ・経路APIのテスト
npm run test:e2e        # 主要ブラウザ（Safari/Chrome/Firefox、スマホ表示含む）での通し確認
npm run check:apis      # APIキー設定後、実際の外部APIに接続できるかを確認
```

`npm run test:e2e` の初回は `npx playwright install chromium webkit firefox` でブラウザを入れてください。

APIキーが未設定でも動きます。
- `DEV_LOGIN=true` で **開発用ログイン**（名前だけでログイン）と **モックカレンダー**（設定画面で「埋まり」を登録）が使えます。
- 経路検索キーが未設定なら、住所から疑似的な所要時間を返すモックを使います。
- SMTP未設定ならメールはコンソール出力され、`/dev/mails` で確認できます。

## API の準備（未実施・要対応）

| 用途 | 設定する環境変数 | 準備内容 |
| --- | --- | --- |
| ログイン・カレンダー | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud で OAuth クライアント（Webアプリ）を作成。リダイレクトURI：`${APP_URL}/api/auth/google/callback`。Google Calendar API を有効化。OAuth同意画面にスコープ `calendar.freebusy` と `calendar.events.owned` を追加 |
| 車・徒歩・自転車 | `GOOGLE_ROUTES_API_KEY` | Routes API を有効化。要件どおり **クォータを1日1,000件**、**予算アラート** を Google Cloud 側で設定 |
| 電車・バス（推奨） | `RAPIDAPI_KEY` / `RAPIDAPI_NAVITIME_HOST` / `RAPIDAPI_NAVITIME_GEOCODING_HOST` | RapidAPI で NAVITIME Route(totalnavi) と NAVITIME Geocoding を購読。ホスト名は購読画面の値を設定 |
| 電車・バス（代替） | `EKISPERT_API_KEY` | 駅すぱあと API。両方設定した場合は `TRANSIT_PROVIDER`（`navitime` / `ekispert`）で選択 |
| メール | `SMTP_*` / `MAIL_FROM` / `DEVELOPER_EMAIL` | 送信用SMTP。`DEVELOPER_EMAIL` に利用上限の通知が届きます |
| 定期実行 | `CRON_SECRET` | サーバー常駐時は判定・期限の時刻ちょうどにタイマーで実行（取りこぼし対策で1分ごとにも確認）。サーバーレス環境では `/api/cron` を1分ごとに `Authorization: Bearer <CRON_SECRET>` で呼ぶ |

キーを設定したら `npm run check:apis` で各 API に1回ずつ接続して確認できます（Google Calendar の確認は、Google でログインしてカレンダーを連携したあとに実行）。

各 API のリクエスト・レスポンスの形式は公式仕様で確認し、`tests/route-providers.test.ts` でテストしています。
実際の接続はキーの取得後に `check:apis` で確認してください。

## 要件との対応

| 要件 | 実装場所 |
| --- | --- |
| F-01, F-02 ログイン・カレンダー連携（FreeBusyのみ取得） | `src/app/api/auth/google/*`, `src/lib/calendar.ts` |
| F-03, F-04 出発地点（複数・標準切替）、移動手段 | `src/app/onboarding`, `src/app/settings` |
| F-11, F-12 グループ作成・招待リンク・グループ参加 | `src/app/groups`, `src/app/invite/[token]`, `src/lib/groups.ts` |
| F-13, F-14 候補入力・〇×手入力 | `src/app/events/new`, `src/app/invite/[token]`, `src/app/events/[id]` |
| F-15〜F-19 自動判定・自動確定・主催者選択（24h）・期限切れ確定・全員不可時 | `src/lib/scheduler.ts`, `src/lib/judge.ts`, `src/app/events/[id]/choose` |
| F-20 確定した予定を各自のカレンダーへ書き込み（未連携の人には .ics と「Googleカレンダーに追加」リンク） | `src/lib/calendar.ts#insertEvent`, `src/lib/ics.ts` |
| F-31 メール通知（確定・選択依頼・期限前リマインド・移動時間未計算） | `src/lib/scheduler.ts`, `src/lib/mail.ts` |
| 判定ロジック（出発 = 開始 − 5分 − 行き / 帰着 = 終了 + 帰り） | `src/lib/judge.ts` |
| 経路検索（Google Routes / NAVITIME / 駅すぱあと）・キャッシュ・月9,500件で停止・80%で開発者通知 | `src/lib/routes/` |
| 判定の速さ（判定・期限の時刻ちょうどに実行） | `src/lib/timers.ts`, `src/instrumentation.ts` |
| 対応環境（主要ブラウザ・スマホ表示） | `e2e/flow.spec.ts`（iPhone Safari / Android Chrome / Firefox / Safari） |

## 実装上の判断（要件に明記がなかった点）

- **グループと調整**：招待リンクはグループごとに発行します。調整を作ると、その時点のグループメンバー全員が参加者になります。
  判定のあとにグループへ参加した人は「あとから参加した人」として扱い、確定済みの予定は終わっていないものだけに加えます。
- 調整の作成画面で、その場で新しいグループを作ることもできます（グループ作成と最初の調整を一度に行えます）。
- **カレンダー未連携の人の F-20**：本人の権限なしにはカレンダーへ書き込めないため、確定メールに .ics を添付し、
  「Googleカレンダーに追加」リンクを付けます（判定結果画面にも表示）。
- **未回答の〇×は×扱い**。カレンダー未連携の主催者は、自分の候補をすべて〇で初期登録（変更可）。
- **期限前のリマインド** は選択期限の3時間前に1回送信（`REMINDER_BEFORE_HOURS`）。
- **判定の速さ**：判定・選択期限・リマインドの時刻にタイマーを設定して即座に実行します。判定時刻を過ぎた調整の画面を開いた場合も、その場で判定します。
- **経路キャッシュ** のキーは「起点・集合場所・移動手段・行き/帰り・平日/土日・時」。有効期限30日。
- カレンダー取得に失敗したメンバーは、〇×の手入力があればそれで判定、なければ×。
- 候補の出し直しは、全員不可時（F-19）のみ。メンバーはそのままで、1時間後に再判定します。
- 自分の移動時間は本人にだけ表示し、他メンバーには参加可否（〇×）のみ表示します。
