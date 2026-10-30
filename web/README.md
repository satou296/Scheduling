# 調整しよう（Web版）

要件定義書（`../スケジュール調整アプリ 要件定義書 (1).md`）のフェーズ1（F-01〜F-31）の実装です。

- Next.js 16（App Router / Server Actions）+ TypeScript + Tailwind CSS v4
- Prisma 6 + SQLite（本番は PostgreSQL などに `provider` を変更可）
- Google OAuth（ログイン・カレンダー連携）、Google Calendar Events API（予定の日時のみ取得）
- 経路検索：Google Routes API（車・徒歩・自転車）、NAVITIME totalnavi via RapidAPI（電車・バス）
- メール：SMTP（nodemailer）

## 起動

Node.js は **22.23.4 以上の 22 系、または 24.22.1 以上** が必要です（2026年10月の証明書の問題の修正版。`node -v` で確認）。
古い版では `npm install` / `npm ci` がエラーで止まるので、[nodejs.org](https://nodejs.org/) から入れ直してください。

```bash
npm install
npm run env:init        # .env を作成し、SESSION_SECRET にランダムな値を設定
npm run db:push
npm run dev             # http://localhost:3000
npm test                # 判定ロジック・スケジューラ・経路APIのテスト
npm run test:e2e        # 主要ブラウザ（Safari/Chrome/Firefox、スマホ表示含む）での通し確認
npm run check:apis      # APIキー設定後、実際の外部APIに接続できるかを確認
```

友人との試用で、運営者のパソコンをサーバーにする手順は [docs/local-trial.md](docs/local-trial.md) にあります。

`npm run test:e2e` の初回は `npx playwright install chromium webkit firefox` でブラウザを入れてください。

APIキーが未設定でも動きます。
- `DEV_LOGIN=true` で **開発用ログイン**（名前だけでログイン）と **モックカレンダー**（設定画面で「埋まり」を登録）が使えます。
- 経路検索キーが未設定なら、住所から疑似的な所要時間を返すモックを使います。
- SMTP未設定ならメールはコンソール出力され、`/dev/mails` で確認できます。

## 運営者の情報（環境変数）

プライバシーポリシー（`/privacy`）に表示する運営者名と問い合わせ先は、リポジトリに個人の情報を書かないよう環境変数で設定します。

| 環境変数 | 内容 | 例 |
| --- | --- | --- |
| `OPERATOR_NAME` | 運営者名（個人名・ニックネーム・団体名など） | `調整しよう運営チーム` |
| `SUPPORT_EMAIL` | 問い合わせ先のメールアドレス。Google Cloud の OAuth 同意画面の「ユーザーサポートメール」と同じものにする | `support@example.com` |

- 開発中は `web/.env`、本番は公開先の管理画面（環境変数の設定）で設定します。
- 未設定のときは、プライバシーポリシーのページに「運営者の情報が設定されていません」と警告を表示します。**公開する前に必ず設定してください**（Google の審査では、プライバシーポリシーに問い合わせ先が必要です）。
- 画面はリクエストのたびに作るので、値を変えたらサーバーを再起動すれば反映されます（再ビルドは不要）。

## API の準備（未実施・要対応）

| 用途 | 設定する環境変数 | 準備内容 |
| --- | --- | --- |
| ログイン・カレンダー | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud で OAuth クライアント（Webアプリ）を作成。リダイレクトURI：`${APP_URL}/api/auth/google/callback`。Google Calendar API を有効化。OAuth同意画面にスコープ `calendar.events.owned` を追加 |
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
| F-01, F-02 ログイン・カレンダー連携（予定の日時のみ取得。内容は取得しない） | `src/app/api/auth/google/*`, `src/lib/calendar.ts` |
| F-03, F-04 出発地点（複数・標準切替）、移動手段 | `src/app/onboarding`, `src/app/settings` |
| F-11, F-12 グループ作成・招待リンク・グループ参加 | `src/app/groups`, `src/app/invite/[token]`, `src/lib/groups.ts` |
| F-13, F-14 候補入力・〇×手入力 | `src/app/events/new`, `src/app/invite/[token]`, `src/app/events/[id]` |
| F-15〜F-19 自動判定・自動確定・主催者選択（24h）・期限切れ確定・全員不可時（決行・出し直し・中止、2時間で自動中止） | `src/lib/scheduler.ts`, `src/lib/judge.ts`, `src/app/events/[id]/choose` |
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
- **予定の扱い**（要件「予定は内容にかかわらずすべて不可」を優先）：終日の予定、「予定なし（空き時間として表示）」の予定も不可。
  FreeBusy API はこれらを返さないため、Events API から日時・種類・自分の出欠だけを取得しています（タイトル・説明・場所・参加者は取得しない）。
  ただし、キャンセルされた予定、自分が「不参加」と回答した招待、カレンダーが自動表示する連絡先の誕生日・勤務場所は除きます。
  対象はメインのカレンダーのみです。
- カレンダー取得に失敗したメンバーは、〇×の手入力があればそれで判定、なければ×。
  取得や書き込みに失敗しても、判定・確定の処理は止めずに他のメンバーの処理を続けます。
- **カレンダーの連携が切れたとき**（Google が `invalid_grant` を返したとき。権限の取り消し、テスト状態の7日の期限、6か月未使用など）：
  そのメンバーを未連携に戻してトークンを消し、連携し直すよう本人にメールで知らせます（1回だけ）。
  通信エラーなどの一時的な失敗では連携を外さず、その回だけ〇×の手入力で判定します。
- 候補の出し直しは、全員不可時（F-19）のみ。メンバーはそのままで、1時間後に再判定します。
- **全員不可時の対応期限**：募集開始（作成時、または出し直した時刻。`Event.collectingSince`）から2時間後（`FALLBACK_DEADLINE_MIN`）。
  通常は判定の1時間後になります。サーバー停止などで判定が遅れて期限が近すぎる場合は、判定から最低1時間（`FALLBACK_MIN_REMAINING_MIN`）残します。
  期限を過ぎたら自動で中止し、主催者とメンバー全員にメールで知らせます。対応期限は短いため、選択期限のような事前リマインドは送りません。
- 全員不可の通知は、主催者には「決行・出し直し・中止」の選択依頼として、メンバーには「主催者が対応を選んでいる」こととその期限として送ります。
  主催者が自分で中止した場合、主催者本人には中止メールを送りません。
- **開始時刻を過ぎた候補**：候補は作成・出し直しの時点で開始時刻より前のものだけ受け付けます。
  サーバーの停止などで判定や期限の処理が遅れた場合、その時点で開始時刻を過ぎた候補は判定・確定の対象から外します（`upcomingSlots`）。
  判定の時点で候補がすべて過ぎていたら、全員不可と同じく主催者の対応待ちにし、出し直しか中止を選んでもらいます（決行は選べません）。
  選択期限が過ぎたときは、全員が参加できる枠のうち開始時刻を過ぎていない最も早い枠で確定し、そうした枠がなければ中止してメンバー全員に知らせます。
- 自分の移動時間は本人にだけ表示し、他メンバーには参加可否（〇×）のみ表示します。
- **Google の審査を受ける前提**：公開ページ（トップ `/`・プライバシーポリシー `/privacy`）はログインなしで見られます。
  プライバシーポリシーの内容は実装と一致させ、Google のデータの扱いを変えたら同じ PR でページと `PRIVACY_UPDATED_AT`（`src/lib/site.ts`）を更新します。
  「Google でログイン」ボタンは Google のブランドガイドラインに従い、G のロゴは公式素材の外枠だけを外したもの（`public/google-g.svg`）を使います。
- **候補日の入力**：年・月・日の3つの欄に分け、年を4桁・月を2桁入力すると次の欄へ自動で移ります（`DateFields`）。
  ブラウザ標準の日付欄（`type="date"`）は欄の移動をページ側で制御できず、Chrome では年に6桁まで入るため自前の欄にしています。
  入力済みの欄に打つとその数字から入力し直し、「2026-11-08」などを貼り付けると3つの欄にまとめて入ります。カレンダーからも選べます。
