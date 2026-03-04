# ichi0g0y.io

`Bun + TypeScript + React + Vite + Tailwind + Radix UI` で構築した、シンプルなSPAポートフォリオです。

## セットアップ

```bash
bun install
cp .dev.vars.example .dev.vars
```

GitHub OAuth App を作成し、Authorization callback URL に `http://localhost:5173/api/auth/github/callback` を設定してください。

翻訳を有効にする場合は `.dev.vars` に `OPENAI_API_KEY`（必要に応じて `OPENAI_MODEL`）を設定してください。

R2を使う場合は、事前にバケットを作成してください。

```bash
wrangler r2 bucket create ichi0g0y-io
```

## 開発サーバー

```bash
task dev
```

`task dev` は Web と Workers API を同時起動します。

フロントエンドのみ起動したい場合:

```bash
task dev-web
```

Workers API のみ起動したい場合:

```bash
task worker-dev
```

`worker-dev` は `wrangler dev --env dev --local` で起動します。
ローカル開発中は画像URLを `/api/images/:id` で扱い、リモート環境では `R2_PUBLIC_BASE_URL`（prod: `https://s3.ichi0g0y.io`）を使います。

初回はD1マイグレーションをローカル適用してください。

```bash
task d1-migrate-local
```

既存の `gear_items` 画像URLをR2へ一括バックフィルする場合:

```bash
task images-backfill-r2-remote
```

## 環境データの保存/復元

Worktree 間で開発用データを引き継ぐため、`~/.envs/<repo名>/` に保存/復元できます。

```bash
task env:save
task env:restore
```

対象:

- `.envrc`
- `.dev.vars`
- `.dev.vars.example`
- `.prod.vars`（本番反映用）
- `env/`
- `.wrangler/state/`（ローカルD1など）

`conductor.json` の `setup` では復元（`env:restore` 相当）と依存関係インストール（`task install`）を自動実行します。

## ビルド

```bash
bun run build
```

## 技術スタック

- Bun
- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- Radix UI (`Icons`)
- Cloudflare Workers + D1

## 仕様

- 画面表示名は `ICH`
- Twitch / X / GitHub の外部リンクを掲載
- 1ページ完結のSPA
- 隠し管理モード（GitHub OAuth + access/refresh token）
- URLからOG情報を取得して機材カードを追加
- 管理画面で登録/更新した画像URLはR2へバックアップし、リモートでは `s3*.ichi0g0y.io/<id>` の公開URLで配信
