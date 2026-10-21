# Scheduling（調整しよう）

友人同士の遊びの日程を、主催者が候補枠を入れるだけで自動的に決めるスケジュール調整アプリです。
メンバーの Google カレンダーの空き状況と、集合場所までの移動時間から参加可否を判定し、条件に合う枠を確定します。

## 構成

| パス | 内容 |
| --- | --- |
| [`スケジュール調整アプリ 要件定義書 (1).md`](./スケジュール調整アプリ%20要件定義書%20(1).md) | 要件定義書 |
| [`web/`](./web) | Web版（フェーズ1：F-01〜F-31）。Next.js + Prisma |

iPhoneアプリ（フェーズ2）は今後追加予定です。

## Web版のクイックスタート

```bash
cd web
npm install
npm run env:init        # .env を作成し、SESSION_SECRET にランダムな値を設定
npm run db:push
npm run dev             # http://localhost:3000
```

APIキーがなくても、開発用ログインとモック（カレンダー・経路検索・メール）で全体の流れを確認できます。
APIの準備や要件との対応表は [`web/README.md`](./web/README.md) を参照してください。
