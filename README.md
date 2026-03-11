# ichi0g0y.io

`Bun + TypeScript + React + Vite + Tailwind + Radix UI` で構築した、シンプルなSPAポートフォリオです。

## セットアップ

```bash
bun install
cp .dev.vars.example .dev.vars
```

GitHub OAuth App を作成し、Authorization callback URL に `http://localhost:5173/api/auth/github/callback` を設定してください。

X OAuth を使う場合は `.dev.vars` に `TWITTER_CLIENT_ID`（または `TWITTER_CONSUMER_KEY`）、必要に応じて `TWITTER_CLIENT_SECRET` / `TWITTER_CONSUMER_SECRET`、`TWITTER_BEARER_TOKEN` を設定し、Callback URL を `http://localhost:5173/api/twitter/auth/callback` に設定してください。  
Withings Webhook後にXへ画像付き投稿する場合は `TWITTER_OAUTH_SCOPE` に `tweet.write` `offline.access` `media.write` を含めてください。

翻訳を有効にする場合は `.dev.vars` に `OPENAI_API_KEY`（必要に応じて `OPENAI_MODEL`）を設定してください。

Withings 連携を有効にする場合は `.dev.vars` に `WITHINGS_CLIENT_ID` と `WITHINGS_CLIENT_SECRET`、`WITHINGS_PUBLIC_ORIGIN`（必要なら `WITHINGS_CALLBACK_URL` / `WITHINGS_NOTIFY_CALLBACK_URL` / `WITHINGS_NOTIFY_SECRET` / `WITHINGS_OAUTH_SCOPE`）を設定してください。

R2を使う場合は、事前にバケットを作成してください。

```bash
wrangler r2 bucket create ichi0g0y-io
wrangler r2 bucket create ichi0g0y-io-remote
```

remoteデバッグ用にD1を分離する場合は、以下を作成して `wrangler.toml` の `env.remote.d1_databases.database_id` を置き換えてください。

```bash
wrangler d1 create ichi0g0y-io-remote
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

Withings等の外部Webhook連携を試す場合は remote 開発を使ってください。

```bash
task dev:remote
```

`task dev:remote` は zellij セッション `ichi0g0y-io` を使います。
既存セッションがあれば一度 kill し、2ペイン（左: Worker remote / 右: Web）で再作成してアタッチします。
起動時に remote 公開URL（`WITHINGS_PUBLIC_ORIGIN`）と `http://localhost:8787` を表示します。

セッションだけ閉じたい場合:

```bash
task dev:remote:kill
```

Webのみ起動する場合:

```bash
task dev:remote:web
```

Workers APIのみ起動する場合:

```bash
task worker-dev-remote
```

`workers.dev` 側（`https://...workers.dev`）へ直接アクセスした時のログは、次で確認できます。

```bash
task worker-tail-remote
```

Withingsなど固定URLが必要な連携向けに、`workers.dev` へ remote デプロイする場合:

```bash
task remote:deploy
```

`task remote:deploy` は `.dev.vars` を `env.remote` へ反映し、`APP_ORIGIN` は `https://<worker-name>.<subdomain>.workers.dev` に自動設定したうえで remote deploy します。

Withings OAuth App の Callback URL は、remote固定URLに合わせて次を設定してください。

```text
https://<worker-name>-remote.<subdomain>.workers.dev/api/withings/auth/callback
```

`.dev.vars` の `WITHINGS_PUBLIC_ORIGIN` も同じ origin に合わせてください。
`redirect_uri_mismatch` が出る場合は `WITHINGS_CALLBACK_URL` に、Withings管理画面に登録した Callback URL を完全一致で設定してください（末尾スラッシュ有無も一致させる）。

通知Webhookは `/api/withings/notify` を使います（`WITHINGS_NOTIFY_CALLBACK_URL` 未指定時も自動でこのURL）。  
Withings側には以下の2つを分けて登録してください。

- OAuth callback: `https://<worker-name>-remote.<subdomain>.workers.dev/api/withings/auth/callback`
- Webhook callback: `https://<worker-name>-remote.<subdomain>.workers.dev/api/withings/notify`

必要なら `WITHINGS_NOTIFY_CALLBACK_URL` で Webhook callback を明示指定できます。

Withingsの保存データ解析（`withings_measure_values` + `withings_raw_data`）:

```bash
task withings-analyze-remote
```

表示される `raw_only_metrics` は「取得できているが、現在の要約カラム（weight/fat等）には未投影」の項目です。  
`source` テーブルには sleep / activity を含む生データの取り込み件数が表示されます。
既存連携が `user.metrics` のみの場合、sleep/activity を取得するには再連携（OAuthやり直し）が必要です。

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
- 編集モード限定の X OAuth トークン取得（access token / refresh token）
- URLからOG情報を取得して機材カードを追加
- 管理画面で登録/更新した画像URLはR2へバックアップし、リモートでは `s3*.ichi0g0y.io/<id>` の公開URLで配信
