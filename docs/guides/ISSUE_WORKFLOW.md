# GitHub Issue運用仕様

## 目的

修正内容・進行状況・手順・計画・レビュー観点を GitHub Issues に一元化する。

## 基本原則

- 状態管理は GitHub Issue のラベル + Close で行う
- 1 Issue 1 worktree を基本とし、強く関連する作業のみ同一worktreeで扱う
- PRは小さく分割して順次マージする
- PRのbaseは `develop` を使う（GitHubのデフォルトブランチ設定は変更しない）
- GitHub操作手段は固定しない（REST API / GraphQL API など、環境に合う手段を選ぶ）

## 状態管理

- `Open`: 未着手/待機中（ラベルなし）
- `In Progress`: `status:in-progress` ラベルを付与
- `Close`: 完了（Issueクローズ）
- `status:in-progress` は着手時に付与し、Issueクローズまで維持する
- ブロッカー発生時はクローズせず、Issueコメントに `阻害要因 / 解除条件 / 次アクション` を残す

## 優先度管理

- `priority:P0`: 最優先（障害/致命）
- `priority:P1`: 高優先
- `priority:P2`: 通常優先
- `priority:P3`: 低優先

## Issue記載の最低要件

- 目的と背景（なぜ実施するか）
- スコープ（やること / やらないこと）
- 受け入れ条件（完了を判断できる条件）
- 大きな機能の場合はサブIssueへの分割方針を記載する（進捗はサブIssueのOpen/Closeで管理）
- 関連リンク（関連Issue / PR / 設計メモ）

## Issueスコープ管理（任意）

- `.context/current_issue` で対象Issueを共有してよい
- `/pick` / `/p` の実行自体は任意
- `.context/current_issue` は Issue番号のみを1行で保存する
- 既に `.context/current_issue` がある状態で再設定する場合は、上書き前に警告し、ユーザー確認を取る
- ファイル変更を伴う依頼では、着手前に「Issue化するか」を必ずユーザーへ確認する
- Issue化する場合はIssue作成またはIssue番号指定を行い、対象Issue番号を確定してから進める
- Issue化しない場合は、Issue未作成で進める合意をユーザーと確認して進める

## 実装フロー

1. ファイル変更を伴う依頼を受けたら、着手前にIssue化可否をユーザーへ確認する
2. Issue化がOKならIssueを起票する
3. Issue化する場合は、目的・手順・受け入れ条件と優先度ラベル（`priority:*`）を設定する
4. ConductorでIssue用workspace（worktree）を作成する（基底は `develop`）
5. 必要なら `/pick` または `/p` で対象Issueを固定する
6. Issue化している場合は、着手時に `status:in-progress` を付与する
7. 実装・テストを行い、必要に応じてIssueコメントで進捗共有する
8. レビュー完了後にPRを作成し、本文へ `Closes #<issue-number>` または `Refs #<issue-number>` を記載する
9. PRをマージする
10. マージでIssueを自動クローズする（自動クローズされない場合は手動でクローズし、理由を残す）

## PR運用

- 1Issue 1PRを基本とする
- 1PRの変更は小さく保つ
- 着手後の早い段階で Draft PR を作成してもよい
- 完了させるIssueは `Closes #...`、参照のみは `Refs #...` を使い分ける
- PR本文には対象Issue番号を明記する
- 仕様判断や運用判断はPRだけに閉じず、要点をIssueコメントにも残す

## 完了条件（DoD）

- Issueの受け入れ条件をすべて満たしている
- 必要なテスト/確認手順を実行し、結果をPRまたはIssueで追跡できる
- ドキュメント更新が必要な場合は反映し、不要な場合はIssueコメントで明記する
- 対象Issueと関連Issueの `Closes / Refs` 記載、およびラベル状態が整合している

## レビュー運用

- レビュー依頼時に対象Issue番号を明示する（または `.context/current_issue` を参照する）
- レビュー結果はIssueコメントへ自動投稿しない
- 指摘共有は手動コピーまたは `.context/` 経由で行う
- 判定は `採用 / 不採用 / 追加情報必要`
- 各判定には短くても理由を残す
- 指摘にはファイルパス・行番号・根拠を含める

## コマンド運用

- Claude Code:
  - `/pick <issue-number>`（任意）
  - `/p <issue-number>`（短縮）
  - `/deploy-to-production` / `/dtp`
  - `/deploy-to-staging` / `/dts`
  - `/commit` または `/c`（確認付きコミット）
  - `/commit!` または `/c!`（即時コミット）
- Codex:
  - Slash Command は使えないため、疑似コマンドとして同等内容をプロンプトで指示する
  - `Issue #7 を .context/current_issue に設定して（/pick 相当）`
  - `develop から main へのリリースPRを作成して通常はそのままマージして（/dtp 相当）`

## 補足

- このファイルの内容が `.ai/workflow.md` と矛盾する場合は、`.ai/workflow.md` を正とする
- `/commit` / `/c` または `/commit!` / `/c!` の明示がない限り、コミットしない
