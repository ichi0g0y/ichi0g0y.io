# ICH Portfolio

`Bun + TypeScript + React + Vite + Tailwind + Radix UI` で構築した、シンプルなSPAポートフォリオです。

## セットアップ

```bash
bun install
cp .dev.vars.example .dev.vars
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

初回はD1マイグレーションをローカル適用してください。

```bash
task d1-migrate-local
```

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
- 隠し管理モード（許可メール + 認証コード + access/refresh token）
- URLからOG情報を取得して機材カードを追加
