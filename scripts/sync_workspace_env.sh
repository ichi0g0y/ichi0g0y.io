#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [ "$MODE" != "push" ] && [ "$MODE" != "pull" ]; then
  echo "Usage: $0 <push|pull>"
  exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
REPO_URL="$(git remote get-url origin 2>/dev/null || true)"
if [ -n "$REPO_URL" ]; then
  REPO_NAME="$(basename -s .git "$REPO_URL")"
else
  REPO_NAME="$(basename "$PROJECT_ROOT")"
fi

STORE_ROOT="${WORKSPACE_ENV_STORE_ROOT:-$HOME/.envs}"
STORE_DIR="$STORE_ROOT/$REPO_NAME"

TARGET_FILES=(
  ".envrc"
  ".dev.vars"
  ".dev.vars.example"
)

TARGET_DIRS=(
  "env"
  ".wrangler/state"
)

copy_file_push() {
  local relative_path="$1"
  local source_path="$PROJECT_ROOT/$relative_path"
  local destination_path="$STORE_DIR/$relative_path"

  if [ ! -f "$source_path" ]; then
    return
  fi

  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
  echo "Saved: $relative_path"
}

copy_dir_push() {
  local relative_path="$1"
  local source_path="$PROJECT_ROOT/$relative_path"
  local destination_path="$STORE_DIR/$relative_path"

  if [ ! -d "$source_path" ]; then
    return
  fi

  mkdir -p "$destination_path"
  cp -a "$source_path/." "$destination_path/"
  echo "Saved: $relative_path/"
}

copy_file_pull() {
  local relative_path="$1"
  local source_path="$STORE_DIR/$relative_path"
  local destination_path="$PROJECT_ROOT/$relative_path"

  if [ ! -f "$source_path" ]; then
    return
  fi

  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
  echo "Copied: $relative_path"
}

copy_dir_pull() {
  local relative_path="$1"
  local source_path="$STORE_DIR/$relative_path"
  local destination_path="$PROJECT_ROOT/$relative_path"

  if [ ! -d "$source_path" ]; then
    return
  fi

  mkdir -p "$destination_path"
  cp -a "$source_path/." "$destination_path/"
  echo "Copied: $relative_path/"
}

if [ "$MODE" = "push" ]; then
  mkdir -p "$STORE_DIR"

  for file in "${TARGET_FILES[@]}"; do
    copy_file_push "$file"
  done

  for dir in "${TARGET_DIRS[@]}"; do
    copy_dir_push "$dir"
  done

  echo "Done: saved workspace environment data to $STORE_DIR"
  exit 0
fi

if [ ! -d "$STORE_DIR" ]; then
  echo "Skipped: $STORE_DIR not found"
  exit 0
fi

for file in "${TARGET_FILES[@]}"; do
  copy_file_pull "$file"
done

for dir in "${TARGET_DIRS[@]}"; do
  copy_dir_pull "$dir"
done

if [ -f "$PROJECT_ROOT/.envrc" ]; then
  chmod 600 "$PROJECT_ROOT/.envrc"
  echo "Applied: chmod 600 .envrc"
fi

if command -v direnv >/dev/null 2>&1 && [ -f "$PROJECT_ROOT/.envrc" ]; then
  (cd "$PROJECT_ROOT" && direnv allow .)
  echo "Applied: direnv allow ."
fi

echo "Done: restored workspace environment data from $STORE_DIR"
