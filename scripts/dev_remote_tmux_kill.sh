#!/usr/bin/env bash

set -euo pipefail

RAW_SESSION_NAME="${TMUX_SESSION_NAME:-ichi0g0y-io}"
SESSION_NAME="$(printf '%s' "$RAW_SESSION_NAME" | tr -c '[:alnum:]_-' '_')"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux が見つかりません。インストール後に再実行してください。" >&2
  exit 1
fi

if [[ "$SESSION_NAME" != "$RAW_SESSION_NAME" ]]; then
  echo "tmux session名を '$RAW_SESSION_NAME' から '$SESSION_NAME' に正規化して使用します。"
fi

if tmux has-session -t "=${SESSION_NAME}" 2>/dev/null; then
  tmux kill-session -t "=${SESSION_NAME}"
  echo "tmux session '${SESSION_NAME}' を終了しました。"
else
  echo "tmux session '${SESSION_NAME}' は存在しません。"
fi
