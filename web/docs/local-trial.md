# 自分のパソコンで試用する（友人との試用）

公開用のサーバーを用意する前に、運営者のパソコンでサーバーを動かして友人と試すための手順です。
データ（DB）は運営者のパソコンだけに保存します。

> **前提**：この方法は一時的な試用のためのものです。本番（Google の審査を受ける公開版）は、常時動くサーバーで運用します。

## できること・できないこと

- 動くのは **運営者のパソコンが起動していて、スリープしていない間だけ** です。主催者が友人でも同じです。
- パソコンが止まっている間の判定・期限・リマインドは、次に起動したときにまとめて実行されます（`src/instrumentation.ts`）。
  その時点で開始時刻を過ぎた候補は判定・確定の対象から外します（`upcomingSlots`）。
- 全員不可時の対応期限は募集開始から2時間と短いので、パソコンが止まっている間に過ぎると、主催者が選ぶ前に中止になります。
- 試用中のデータは捨てる前提にしてください。本番の DB には移しません。

友人には、始める前に次のことを伝えてください。
- 運営者のパソコンが動いている間だけ使えること
- 入力した情報と Google カレンダーの許可（トークン）は、運営者のパソコンに保存されること
- 試用が終わったらデータを削除すること

## 1. 準備（パソコン）

### ディスクの暗号化
友人の Google カレンダーの許可（リフレッシュトークン）が DB に保存されます（暗号化はまだ実装していません）。
「システム設定」→「プライバシーとセキュリティ」→ **FileVault がオンになっている** ことを確認してください。

### 開発用とは別のフォルダを使う
開発用のフォルダで `npm run build` などを実行すると、動いている試用サーバーに影響します。試用サーバーは別のフォルダに置きます。

```bash
git clone https://github.com/satou296/Scheduling.git ~/scheduling-trial
cd ~/scheduling-trial/web
npm ci
npm run env:init
```

このフォルダではコミットしません（`main` を取り込むだけ）。

## 2. 外部から HTTPS でアクセスできるようにする（Tailscale Funnel）

Google のログインは、戻り先の URL が **HTTPS で、正式なドメイン** である必要があります（IP アドレスは不可、`localhost` は例外）。
[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) を使うと、無料で `https://<端末名>.<tailnet名>.ts.net` という固定の URL が付きます。友人は何もインストールする必要がありません。

### Mac での注意
Mac で Funnel を使えるのは、オープンソース版（コマンドラインの `tailscaled`）だけです。App Store 版・Standalone 版のアプリでは使えません（[macOS の各版の比較](https://tailscale.com/kb/1065/macos-variants)）。
アプリ版を入れている場合は、終了してから次の手順を行ってください。

```bash
brew install --formula tailscale
sudo brew services start tailscale   # 起動時に自動で動くようにする
sudo tailscale up                    # ブラウザが開くので Tailscale にログイン（無料の Personal プラン）
```

手順は [Tailscaled on macOS](https://github.com/tailscale/tailscale/wiki/Tailscaled-on-macOS) を参照してください。

### 公開する
アプリはポート 3100 で動かします（開発サーバーの 3000 と分けるため）。

```bash
sudo tailscale funnel --bg 3100
```

初回は、Funnel を有効にするための画面がブラウザで開くので承認します（HTTPS の証明書と設定は自動で作られます）。
`--bg` を付けると、再起動後も公開が続きます。

```bash
sudo tailscale funnel status   # 公開中の URL を確認する
sudo tailscale funnel reset    # 公開をやめる
```

表示された `https://〜.ts.net` が、このあと使う **公開の URL** です。

## 3. Google Cloud の設定

[Google Auth Platform](https://console.cloud.google.com/auth/overview) で設定します。

| 画面 | 設定 |
| --- | --- |
| クライアント → OAuth クライアント | 承認済みのリダイレクト URI に `https://〜.ts.net/api/auth/google/callback` を追加 |
| ブランディング | アプリ名「調整しよう」、ユーザーサポートメール。承認済みドメインの追加を求められたら `<tailnet名>.ts.net` を追加 |
| 対象 | 公開ステータスを選ぶ（下の表） |

| 公開ステータス | 友人が見る画面 | 注意 |
| --- | --- | --- |
| **本番環境（未審査）** | 「このアプリは Google で確認されていません」という警告が出る。「詳細」から「（アプリ名）に移動」を選ぶと進める | 利用者は合計 100 人まで |
| テスト | 警告なし | 友人のメールアドレスをテストユーザーに登録する必要がある。**7日でカレンダーの連携が切れる**（判定は止まらないが、毎週連携し直す必要がある） |

`ts.net` のドメインは運営者のものではないため、Google の審査（ドメインの所有確認）には使えません。審査は本番の公開先で受けます。

## 4. `.env` の設定

`~/scheduling-trial/web/.env` を編集します（コミットしないファイルです）。

```bash
DATABASE_URL="file:./trial.db"           # prisma/trial.db に保存。開発用の dev.db とは分ける
APP_URL="https://〜.ts.net"              # 公開の URL（末尾の / は付けない）
GOOGLE_CLIENT_ID="…"
GOOGLE_CLIENT_SECRET="…"
OPERATOR_NAME="…"
SUPPORT_EMAIL="…"
DEV_LOGIN="false"
```

### メール（Gmail で送る場合）
Google アカウントの [アプリ パスワード](https://support.google.com/accounts/answer/185833)（2段階認証が必要）を作り、次のように設定します。

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="<Gmail のアドレス>"
SMTP_PASS="<アプリ パスワード>"
MAIL_FROM="調整しよう <Gmail のアドレス>"   # SMTP_USER と同じアドレスにする
```

送信元として、運営者の Gmail のアドレスが友人に見えます。

### 移動時間
経路検索のキー（`GOOGLE_ROUTES_API_KEY`・`RAPIDAPI_*` など）が未設定だと、住所から決めた **疑似的な所要時間** で判定します。
実際の移動時間で試す場合はキーを設定し、`npm run check:apis` で接続を確認してください。

## 5. 起動

```bash
cd ~/scheduling-trial/web
npm run db:push
npm run build
caffeinate -i npm start -- -p 3100 -H 127.0.0.1
```

- **`npm run dev` では公開しないでください。** 開発モードでは開発用ログイン（名前だけでログイン）が有効になり、URL を知った人が誰の名前でもログインでき、`/dev/mails` でメールの本文も見られます。
  `npm start`（本番モード）では、`DEV_LOGIN` の値にかかわらず開発用ログインは無効です（`src/lib/session.ts`）。
- `-H 127.0.0.1` で、同じ Wi-Fi のほかの端末から直接アクセスできないようにしています（外からは Funnel 経由だけ）。
- `caffeinate -i` は、サーバーが動いている間スリープしないようにします。**MacBook は蓋を閉じるとスリープする** ので、蓋は開けたままにしてください。
- 運営者自身も、`localhost` ではなく公開の URL からアクセスしてください（ログイン後は `APP_URL` に戻るため、`localhost` ではログイン状態になりません）。

### 最初に確認すること
1. 公開の URL でトップページとプライバシーポリシーが見られる（運営者の情報の警告が出ていない）
2. Google でログインし、カレンダーを連携できる
3. グループを作れる（フォームの送信が失敗する場合は下の「うまくいかないとき」）
4. 招待リンクから友人が参加でき、メールが届く

## 6. 更新・終了

### 新しい版にする
```bash
cd ~/scheduling-trial
git pull --ff-only
cd web
npm ci
npm run db:push
npm run build
# サーバーを止めて（Ctrl+C）、もう一度 5. の npm start を実行
```

### 試用を終える
1. サーバーを止め、`sudo tailscale funnel reset` で公開をやめる
2. `~/scheduling-trial/web/prisma/trial.db` を削除する
3. Google Cloud のリダイレクト URI から `〜.ts.net` を外す
4. 友人に、Google アカウントの [サードパーティ製のアプリとサービス](https://myaccount.google.com/connections) から許可を取り消せることを伝える

## うまくいかないとき

| 症状 | 原因と対処 |
| --- | --- |
| Google のログインで `redirect_uri_mismatch` | Google Cloud のリダイレクト URI と `APP_URL` が一致していない（`https://`・末尾の `/` の有無を確認） |
| ボタンを押すとエラーになる（ログに `Invalid Server Actions request`） | Next.js は、フォームの送信元（`Origin`）とアクセス先（`Host` / `X-Forwarded-Host`）が違うと拒否する。Funnel 経由で一致しない場合は `next.config.ts` に `serverActions.allowedOrigins` を追加する必要があるので、開発側に連絡する |
| ログインしたのにログイン画面に戻る | `localhost` からアクセスしている。公開の URL からアクセスする |
| メールが届かない | サーバーのログに `sendMail failed` が出ていないか確認。アプリ パスワード・`MAIL_FROM` のアドレスを確認 |
| しばらくするとつながらない | パソコンがスリープした、または `npm start` が止まった。`caffeinate` 付きで起動し直す |
