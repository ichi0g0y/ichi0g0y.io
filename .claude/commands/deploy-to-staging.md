---
title: "ステージング反映PRタスク"
read_only: false
type: "command"
argument-hint: "[--no-merge] [release-label]"
---

# ステージング反映PR作成（/deploy-to-staging）

## 目的

`develop -> staging` の反映PRを定型化し、ステージング反映手順を統一する。

## 実行手順

1. `.ai/workflow.md` と `.ai/git.md` のPR運用ルールを確認する。
2. `origin/staging` と `origin/develop` を最新化し、両ブランチが存在することを確認する。
   - `origin/staging` が存在しない場合はPR作成を中断し、ブランチ作成方針を確認する。
3. `base=staging` / `head=develop` のOpen PRが既にあるか確認する。
4. Open PRがない場合は `develop -> staging` のPRを作成する。
   - タイトル例: `staging: develop を staging へ反映 (<YYYY-MM-DD>)`
   - 本文には、目的・影響範囲・確認手順・未実施項目を記載する。
5. Open PRがある場合は、そのPRを再利用する（重複PRは作成しない）。
6. `--no-merge` が明示されていない場合は、チェック成功を確認してPRをマージする。
7. 結果を日本語で報告する（PR URL、マージ有無、未実施項目）。

## ルール

- デフォルト動作は「PR作成または再利用後にマージまで実行」。
- `--no-merge` 指定時のみ、PR作成または再利用までで止める。
- `staging` への直接push/直接マージは行わない。
- 必須チェック未通過ならマージしない。
- 既存のOpenな `develop -> staging` PRがある場合は、それを優先して使う。
- コンフリクトがある場合は自動解消しない。`develop` 側で解消してから同一PRを更新する。
