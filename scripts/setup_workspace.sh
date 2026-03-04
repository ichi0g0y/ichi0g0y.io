#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 既存の環境データ復元フローを先に実行する
bash "$SCRIPT_DIR/setup_envrc.sh"

# 依存関係をセットアップする
task install
