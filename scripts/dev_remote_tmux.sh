#!/usr/bin/env bash

set -euo pipefail

RAW_SESSION_NAME="${TMUX_SESSION_NAME:-ichi0g0y-io}"
SESSION_NAME="$(printf '%s' "$RAW_SESSION_NAME" | tr -c '[:alnum:]_-' '_')"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS_FILE="$ROOT_DIR/.dev.vars"

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

extract_dev_var() {
  local key="$1"
  if [[ ! -f "$DEV_VARS_FILE" ]]; then
    return 0
  fi
  local raw
  raw="$(awk -F= -v key="$key" '$1 == key {print substr($0, index($0, "=") + 1); exit}' "$DEV_VARS_FILE" 2>/dev/null || true)"
  trim "${raw%$'\r'}"
}

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux が見つかりません。インストール後に再実行してください。" >&2
  exit 1
fi

if [[ "$SESSION_NAME" != "$RAW_SESSION_NAME" ]]; then
  echo "tmux session名を '$RAW_SESSION_NAME' から '$SESSION_NAME' に正規化して使用します。"
fi

REMOTE_PUBLIC_URL="$(extract_dev_var "WITHINGS_PUBLIC_ORIGIN")"
if [[ -z "$REMOTE_PUBLIC_URL" ]]; then
  CALLBACK_URL="$(extract_dev_var "WITHINGS_CALLBACK_URL")"
  if [[ -n "$CALLBACK_URL" ]]; then
    REMOTE_PUBLIC_URL="$(printf '%s' "$CALLBACK_URL" | sed -E 's#^(https?://[^/]+).*$#\1#')"
  fi
fi

if [[ -n "$REMOTE_PUBLIC_URL" ]]; then
  echo "Remote URL: $REMOTE_PUBLIC_URL"
else
  echo "Remote URL: (未設定) .dev.vars に WITHINGS_PUBLIC_ORIGIN を設定してください。"
fi
echo "Worker local proxy: http://localhost:8787"

# 先にセッションを作成し、各ペインへコマンドを送る方式にすると
# 起動コマンドの失敗でセッション自体が消える問題を避けられる。
tmux new-session -d -s "$SESSION_NAME" -c "$ROOT_DIR"
tmux send-keys -t "${SESSION_NAME}:0.0" "cd \"$ROOT_DIR\" && echo \"Remote URL: ${REMOTE_PUBLIC_URL:-not-configured}\" && task worker:dev:remote:noinstall" C-m
tmux split-window -h -t "${SESSION_NAME}:0.0" -c "$ROOT_DIR"
tmux send-keys -t "${SESSION_NAME}:0.1" "cd \"$ROOT_DIR\" && task dev:remote:web:noinstall" C-m
tmux select-layout -t "${SESSION_NAME}:0" even-horizontal

if [[ -n "${TMUX:-}" ]]; then
  tmux switch-client -t "$SESSION_NAME"
else
  tmux attach-session -t "$SESSION_NAME"
fi
