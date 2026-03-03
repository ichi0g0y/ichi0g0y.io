# agentic-boilerplate-seed

言語やフレームワークをまだ決めていない状態で、AI（Codex / Claude）と協調しながらプロジェクトを立ち上げるための最小ボイラープレートです。

## このテンプレートの方針

- 実装前にAI運用ルールを先に固定する
- 技術スタック未決定でも使えるよう、言語依存ルールを持ち込まない
- レビュー連携は手動コピーまたは `.context/` 経由で共有する
- 修正内容・進行状況・計画・手順・レビュー観点は GitHub Issues に集約し、`docs/` は確定情報のみを保持する
- Issue単位でworktreeを分離し、小さなPRを順次適用する

## ディレクトリ構成

- `.ai/`: エージェント共通ルール（必読）
- `.claude/commands/`: Claude用コマンド定義（pick / p / deploy-to-production / dtp / deploy-to-staging / dts / commit / c / commit! / c!）
- `docs/`: 最小限の運用ドキュメント
- `.context/`: エージェント間の作業連携用（gitignore前提）

## 使い始める手順

1. `docs/guides/GETTING_STARTED.md` を読む
2. `.ai/project.md` に今回の目的と制約を書く
3. 言語選定までは、設計・要件・タスク分解（GitHub Issues）を中心に進める
4. 言語選定後に、必要な開発/テストコマンドを `docs/` と `.ai/` に追加する

## AI協調フロー

- 実装: 指示に沿って実装し、必要な検証結果を報告
- `/pick` or `/p`: 必要時のみ対象Issueを `.context/current_issue` に固定
- レビュー: 指摘を手動コピーまたは `.context/` 経由で共有
- `/deploy-to-production` or `/dtp`: `develop -> main` のリリースPR作成導線
- `/deploy-to-staging` or `/dts`: `develop -> staging` の反映PR作成導線
- `/commit` or `/c`: 確認付きコミット
- `/commit!` or `/c!`: 即時コミット

## GitHub操作の方針

- GitHub操作の手段は固定しない
- 実行手段が変わっても、Issue / PR / コメント / ラベルの結果を一致させる

詳細は `.ai/workflow.md` と `docs/guides/ISSUE_WORKFLOW.md` を参照してください。
