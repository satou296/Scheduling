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
npm test                # 判定ロジック・スケジューラのテスト
```

APIキーが未設定でも動きます。
- `DEV_LOGIN=true` で **開発用ログイン**（名前だけでログイン）と **モックカレンダー**（設定画面で「埋まり」を登録）が使えます。
- 経路検索キーが未設定なら、住所から疑似的な所要時間を返すモックを使います。
- SMTP未設定ならメールはコンソール出力され、`/dev/mails` で確認できます。

## API の準備（未実施・要対応）

| 用途 | 設定する環境変数 | 準備内容 |
| --- | --- | --- |
| ログイン・カレンダー | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud で OAuth クライアント（Webアプリ）を作成。リダイレクトURI：`${APP_URL}/api/auth/google/callback`。Google Calendar API を有効化。OAuth同意画面にスコープ `calendar.freebusy` と `calendar.events.owned` を追加 |
| 車・徒歩・自転車 | `GOOGLE_ROUTES_API_KEY` | Routes API を有効化。要件どおり **クォータを1日1,000件**、**予算アラート** を Google Cloud 側で設定 |
| 電車・バス | `RAPIDAPI_KEY` / `RAPIDAPI_NAVITIME_HOST` | RapidAPI で NAVITIME Route(totalnavi) と NAVITIME Geocoding を購読。**レスポンス形式は契約後に要確認**（`src/lib/routes/navitime.ts`） |
| メール | `SMTP_*` / `MAIL_FROM` / `DEVELOPER_EMAIL` | 送信用SMTP。`DEVELOPER_EMAIL` に利用上限の通知が届きます |
| 定期実行 | `CRON_SECRET` | サーバー常駐時は自動（30秒ごと）。サーバーレス環境では `/api/cron` を1分ごとに `Authorization: Bearer <CRON_SECRET>` で呼ぶ |

## 要件との対応

| 要件 | 実装場所 |
| --- | --- |
| F-01, F-02 ログイン・カレンダー連携（FreeBusyのみ取得） | `src/app/api/auth/google/*`, `src/lib/calendar.ts` |
| F-03, F-04 出発地点（複数・標準切替）、移動手段 | `src/app/onboarding`, `src/app/settings` |
| F-11〜F-14 調整作成・招待リンク・候補入力・〇×手入力 | `src/app/events/new`, `src/app/invite/[token]` |
| F-15〜F-19 自動判定・自動確定・主催者選択（24h）・期限切れ確定・全員不可時 | `src/lib/scheduler.ts`, `src/lib/judge.ts`, `src/app/events/[id]/choose` |
| F-20 確定した予定を各自のカレンダーへ書き込み | `src/lib/calendar.ts#insertEvent` |
| F-31 メール通知（確定・選択依頼・期限前リマインド・移動時間未計算） | `src/lib/scheduler.ts`, `src/lib/mail.ts` |
| 判定ロジック（出発 = 開始 − 5分 − 行き / 帰着 = 終了 + 帰り） | `src/lib/judge.ts` |
| 経路のキャッシュ・月9,500件で停止・80%で開発者通知 | `src/lib/routes/index.ts` |

## 実装上の判断（要件に明記がなかった点）

- **グループ＝調整1件**：招待リンクは調整ごとに発行し、「判定までに参加した人」を判定対象にしています。
- **未回答の〇×は×扱い**。カレンダー未連携の主催者は、自分の候補をすべて〇で初期登録（変更可）。
- **期限前のリマインド** は選択期限の3時間前に1回送信（`REMINDER_BEFORE_HOURS`）。
- **経路キャッシュ** のキーは「起点・集合場所・移動手段・行き/帰り・平日/土日・時」。有効期限30日。
- カレンダー取得に失敗したメンバーは、〇×の手入力があればそれで判定、なければ×。
- 候補の出し直しは、全員不可時（F-19）のみ。メンバーはそのままで、1時間後に再判定します。
- 自分の移動時間は本人にだけ表示し、他メンバーには参加可否（〇×）のみ表示します。
