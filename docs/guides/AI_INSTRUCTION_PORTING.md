# AI指示ファイル移植ガイド

このテンプレートのAI運用ルールを別リポジトリへ移植するための手順です。

## 対象ファイル

- `AGENTS.md`
- `CLAUDE.md`
- `.ai/*.md`
- `.claude/commands/*.md`
- `docs/conductor-prompts.md`

## 移植対象外ファイル（原則）

- `docs/guides/AI_INSTRUCTION_PORTING.md`
- 理由: テンプレート側の導入手順・参照資料であり、対象リポジトリの常設運用ファイルではないため

## 移植手順

1. 対象リポジトリに上記ファイルを配置する
2. 既存の AI 関連ドキュメント（`AGENTS.md` / `CLAUDE.md` / `.ai/*.md`）がある場合は、上書きせず差分比較して統合する
3. 衝突したルールは採用方針（採用 / 不採用 / 保留）を明記する
4. `.ai/project.md` をプロジェクト内容に合わせて更新する
5. `.ai/rules.md` に言語・フレームワーク固有ルールを追加する
6. `.ai/workflow.md` のコマンド例を実運用に合わせて更新する
7. Claude Code を使う場合は `.claude/commands/` を配置し、`/pick` / `/p` / `/deploy-to-production` / `/dtp` / `/deploy-to-staging` / `/dts` / `/commit` / `/c` / `/commit!` / `/c!` を有効化する
8. Codex を使う場合は Slash Command が使えないため、同等処理をプロンプトで指示する運用を明記する
9. 必要に応じて `.context/current_issue` を使う運用（`/pick` / `/p` 任意・未設定時は通常動作）を明記する
10. 既存のタスク管理資料（`docs/TODO.md` など）がある場合は、GitHub Issues運用に移行する
11. 旧タスク管理資料への参照が残っていないことを確認する（`README.md` / `docs/` / `AGENTS.md` など）
12. 移行完了した旧タスク管理資料（`docs/TODO.md` など）を削除する
13. 移植後に以下が満たされることを確認する
    - 修正内容・進行状況・手順書・計画・レビュー観点が GitHub Issues に集約されている
    - Issue単位でworktreeを作成する運用になっている
    - 小さなPRを順次適用する方針が明文化されている
    - GitHub操作手段が固定されず、実行手段に依らず同等結果を求める運用になっている

## 注意点

- 既存プロダクト固有の制約はそのまま流用しない
- ローカル絶対パスを含む設定は削除する
- `/commit` / `/c` と `/commit!` / `/c!` の運用ルールは全リポジトリで統一する
- `docs/` は確定情報の保管先とし、揮発タスクを混在させない
