# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code（および開発者）向けの指示です。

## プロジェクト概要

友人同士の遊びの日程を自動で決めるスケジュール調整アプリ。仕様の正は要件定義書
`スケジュール調整アプリ 要件定義書 (1).md`。実装が要件と食い違う場合は要件定義書を優先し、
要件に書かれていない判断をしたときは `web/README.md` の「実装上の判断」に追記する。

| パス | 内容 |
| --- | --- |
| `web/` | Web版（フェーズ1：F-01〜F-31）。Next.js 16 + Prisma 6 + SQLite |
| `.github/workflows/ci.yml` | lint・型チェック・テスト・ビルドの CI |

iPhoneアプリ（フェーズ2）は未着手。

## Git / GitHub の運用（必ず守る）

- リモート：`origin` = https://github.com/satou296/Scheduling.git 。GitHub のデフォルトブランチは **`main`**、
  ローカルのメインブランチは **`master`**（`origin/main` を追跡）。
- **`main` / `master` に直接コミット・push しない。** 作業は必ず最新の `origin/main` から適切な名前のブランチを切って始める。
  ```bash
  git fetch origin
  git switch -c feature/<内容> origin/main
  git branch --unset-upstream   # origin/main を追跡させない（誤って main に push しないため）
  ```
- ブランチ名は `<種類>/<内容を表す英語のkebab-case>`：
  - `feature/` 新機能（例：`feature/push-notification`）
  - `fix/` 不具合修正（例：`fix/late-join-calendar-write`）
  - `docs/` ドキュメントのみ（例：`docs/add-claude-md`）
  - `refactor/` 振る舞いを変えない整理、`test/` テストのみ、`chore/` 依存関係・設定・CI
- 変更は **プルリクエスト経由** で `main` に入れる。`git push -u origin <ブランチ名>` のあと
  `gh pr create --base main` で作成する（`gh` 未ログインなら、ユーザーに `! gh auth login` を案内し、
  それまでは GitHub の比較URL `https://github.com/satou296/Scheduling/compare/main...<ブランチ名>` を伝える）。
- PR の説明には「何を・なぜ変更したか」「動作確認の方法と結果」を書く（`.github/pull_request_template.md`）。
- PR がマージされたら、ローカルの `master` を `git -C <masterのあるフォルダ> pull --ff-only` で最新化する。
- 強制 push（`--force`）や履歴の書き換えはユーザーの明示的な指示なしに行わない。
- **ユーザーへの報告**：GitHub に反映したときは、どのブランチ・PR に何を加えたかを日本語で説明する。

## コミット前のチェック

`web/` で以下がすべて通ることを確認してからコミットする（CI と同じ内容）。

```bash
cd web
npm run lint
npx next typegen && npx tsc --noEmit
npm test
npm run build
```

- `.env`（秘密鍵入り）、`prisma/*.db` は絶対にコミットしない（`.gitignore` 済み。`git status` で確認する）。
- 個人のパス・メールアドレス・APIキーをコードやドキュメントに書かない。

## 担当範囲

- **API の取得（Google Cloud の OAuth クライアント・Routes API キー、RapidAPI/NAVITIME の契約、SMTP など）は
  ユーザーが行う。** Claude はそれ以外（実装・テスト・ドキュメント）を担当する。
  必要な設定は `web/.env.example` と `web/README.md` の「API の準備」に追記して伝える。
- NAVITIME 連携（`web/src/lib/routes/navitime.ts`）は推測で書いた未検証のコード。キー取得後に要動作確認。

## 開発環境

```bash
cd web
cp .env.example .env     # SESSION_SECRET を変更
npm install              # postinstall で prisma generate
npm run db:push
npm run dev              # http://localhost:3000
```

- `DEV_LOGIN=true` で開発用ログイン（名前だけ）とモックカレンダー（設定画面で予定を登録）が使える。
  経路検索キー未設定時はモックの所要時間、SMTP 未設定時はメールをコンソール出力＋ `/dev/mails` に記録。
- UI を変更したら、開発用ログインで実際に画面を操作して確認する（スマホ幅 390px とデスクトップの両方）。

## 技術的な注意点（ハマりどころ）

### Next.js 16
- 学習データの Next.js と違う点がある。**コードを書く前に `web/node_modules/next/dist/docs/` の該当ガイドを読む**（`web/AGENTS.md` 参照）。
- `cacheComponents` は **無効** にしている（全画面がログイン必須で動的なため）。有効にするとビルドエラーになる。
- `params` / `searchParams` / `cookies()` は Promise（`await` が必要）。ページの型は `PageProps<"/events/[id]">` を使う。
  新しいルートを追加したら `npx next typegen` を実行しないと型エラーになる。
- `middleware` は `proxy` に名前が変わっている。

### Tailwind CSS v4
- 独自クラス（`.btn` など）は `@layer components` ではなく **`@utility`** で定義する（`@apply` で他の独自クラスを参照できないため）。
- 色は `globals.css` の CSS 変数（`--primary` など）で定義し、ダークモードにも対応させる。

### Prisma
- **Prisma 6 系に固定**（7 以降はドライバーアダプター必須など破壊的変更あり）。安易にアップグレードしない。
- `prisma db push --force-reset` は AI エージェントからの実行がブロックされる。テストは `tests/global-setup.ts` で
  `prisma/test.db` を削除してから `db push` する方式。開発用 DB（`prisma/dev.db`）のリセットはユーザーに確認する。
- スキーマ変更後は `npm run db:push`。

## ドメインのルール（要件定義書より）

- 判定：出発時刻 = 開始 − 5分 − 行きの移動時間、帰着時刻 = 終了 + 帰りの移動時間。その間に予定があれば不可
  （`web/src/lib/judge.ts`。ロジックは純粋関数に保ち、テストを書く）。
- 時刻の入力・表示は日本時間（`Asia/Tokyo`）。DB は UTC。変換は `web/src/lib/time.ts` を使う。
- **プライバシー**：Google カレンダーからは FreeBusy（空き／埋まり）しか取得しない。他メンバーには参加可否だけを見せ、
  予定の内容・移動時間・出発地点は見せない。
- Google Routes API は Essentials 区分のみ（`TRAFFIC_UNAWARE`、FieldMask は所要時間だけ）。
  月 9,500 件で停止、7,600 件（80%）で開発者に通知。経路結果はキャッシュして使い回す。
- 状態遷移：`COLLECTING → JUDGING → (CONFIRMED | AWAITING_CHOICE | AWAITING_FALLBACK)`。
  二重実行を防ぐため、状態の切り替えは `updateMany` で条件付きに行う（`web/src/lib/scheduler.ts`）。

## コミュニケーション

- ユーザーとのやり取り、コミットメッセージ、PR、ドキュメントは日本語で書く。
