#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.prod.vars}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "" && ! -f "$ROOT_DIR/$ENV_FILE" && -f "$ROOT_DIR/.dev.vars.prod" ]]; then
  ENV_FILE=".dev.vars.prod"
  echo "warning: .prod.vars がないため .dev.vars.prod を使用します" >&2
fi

if [[ ! -f "$ROOT_DIR/$ENV_FILE" ]]; then
  echo "env file not found: $ROOT_DIR/$ENV_FILE" >&2
  exit 1
fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

is_non_secret_key() {
  case "$1" in
    APP_ORIGIN|ALLOWED_GITHUB_LOGINS|GITHUB_CLIENT_ID|OPENAI_MODEL)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

tmp_secret_file="$ROOT_DIR/.wrangler.secrets.$$.env"
tmp_config_file="$ROOT_DIR/.wrangler.generated.$$.toml"
cleanup() {
  rm -f "$tmp_secret_file" "$tmp_config_file"
}
trap cleanup EXIT

declare -a var_args
while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="$(trim "${raw_line%$'\r'}")"
  if [[ -z "$line" || "$line" == \#* ]]; then
    continue
  fi

  if [[ "$line" != *"="* ]]; then
    echo "skip invalid line: $line" >&2
    continue
  fi

  key="$(trim "${line%%=*}")"
  value="$(trim "${line#*=}")"
  if [[ -z "$key" ]]; then
    continue
  fi

  if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  if is_non_secret_key "$key"; then
    var_args+=(--var "$key:$value")
  else
    printf '%s=%s\n' "$key" "$value" >> "$tmp_secret_file"
  fi
done < "$ROOT_DIR/$ENV_FILE"

cd "$ROOT_DIR"

# [vars] はCLI引数から反映するため、deploy時は一時configで除外する。
awk '
  /^\[vars\]/ { skip=1; next }
  skip && /^\[/ { skip=0 }
  !skip { print }
' wrangler.toml > "$tmp_config_file"

# 先に非secret varsのみ反映し、同名の var/secret 衝突を回避する。
if (( ${#var_args[@]} > 0 )); then
  bunx wrangler --config "$tmp_config_file" deploy "${var_args[@]}"
else
  bunx wrangler --config "$tmp_config_file" deploy
fi

if [[ -s "$tmp_secret_file" ]]; then
  bunx wrangler --config "$tmp_config_file" secret bulk "$tmp_secret_file"
else
  echo "no secrets found in $ENV_FILE"
fi
