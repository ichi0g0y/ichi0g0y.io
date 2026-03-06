#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.dev.vars}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER_CONFIG="$ROOT_DIR/wrangler.toml"
REMOTE_ENV="remote"

if [[ ! -f "$ROOT_DIR/$ENV_FILE" ]]; then
  echo "env file not found: $ROOT_DIR/$ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  echo "wrangler.toml が見つかりません: $WRANGLER_CONFIG" >&2
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
    ALLOWED_GITHUB_LOGINS|GITHUB_CLIENT_ID|OPENAI_MODEL)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

worker_base_name="$(awk -F' = ' '/^name = /{gsub(/"/,"",$2); print $2; exit}' "$WRANGLER_CONFIG")"
if [[ -z "$worker_base_name" ]]; then
  echo "wrangler.toml から name を取得できませんでした" >&2
  exit 1
fi
worker_name="${worker_base_name}-${REMOTE_ENV}"

account_and_subdomain="$(
  node - <<'NODE'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')

const whoami = JSON.parse(execSync('bunx wrangler whoami --json', { encoding: 'utf8' }))
const account = whoami.accounts?.[0]
if (!account?.id) {
  throw new Error('Cloudflare account id を取得できませんでした')
}

const configPath = path.join(os.homedir(), '.wrangler', 'config', 'default.toml')
const config = fs.readFileSync(configPath, 'utf8')
const tokenMatch = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)
if (!tokenMatch?.[1]) {
  throw new Error('~/.wrangler/config/default.toml から oauth_token を取得できませんでした')
}
const token = tokenMatch[1]

async function main() {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.id}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await response.json()
  const subdomain = payload?.result?.subdomain
  if (!response.ok || !subdomain) {
    throw new Error('workers.dev subdomain を取得できませんでした')
  }
  process.stdout.write(`${account.id}\t${subdomain}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
NODE
)"

account_id="${account_and_subdomain%%$'\t'*}"
workers_subdomain="${account_and_subdomain#*$'\t'}"
if [[ -z "$account_id" || -z "$workers_subdomain" ]]; then
  echo "account_id / workers_subdomain の取得に失敗しました" >&2
  exit 1
fi

remote_origin="https://${worker_name}.${workers_subdomain}.workers.dev"

tmp_secret_file="$ROOT_DIR/.wrangler.remote.secrets.$$.env"
tmp_config_file="$ROOT_DIR/.wrangler.remote.generated.$$.toml"
cleanup() {
  rm -f "$tmp_secret_file" "$tmp_config_file"
}
trap cleanup EXIT

declare -a var_args
var_args+=(--var "APP_ORIGIN:${remote_origin}")

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

  if [[ "$key" == "APP_ORIGIN" ]]; then
    # remote環境は workers.dev 固定URLを強制利用する。
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

# remote deployでは production route の誤更新を避けるため、[[routes]] を除外する。
# 併せて [vars] を除外し、CLI引数の --var を正として反映する。
awk '
  /^\[\[routes\]\]/ { skip_routes=1; next }
  skip_routes && /^\[/ { skip_routes=0 }
  skip_routes { next }

  /^\[vars\]/ { skip_vars=1; next }
  skip_vars && /^\[/ { skip_vars=0 }
  skip_vars { next }

  { print }
' "$WRANGLER_CONFIG" > "$tmp_config_file"

bunx wrangler --config "$tmp_config_file" deploy --env "$REMOTE_ENV" "${var_args[@]}"

if [[ -s "$tmp_secret_file" ]]; then
  bunx wrangler --config "$tmp_config_file" secret bulk --env "$REMOTE_ENV" "$tmp_secret_file"
else
  echo "no secrets found in $ENV_FILE"
fi

ACCOUNT_ID_FOR_NODE="$account_id" WORKER_NAME_FOR_NODE="$worker_name" node - <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const accountId = process.env.ACCOUNT_ID_FOR_NODE
const workerName = process.env.WORKER_NAME_FOR_NODE
const tokenConfig = fs.readFileSync(path.join(os.homedir(), '.wrangler', 'config', 'default.toml'), 'utf8')
const tokenMatch = tokenConfig.match(/^oauth_token\s*=\s*"([^"]+)"/m)
if (!tokenMatch?.[1]) {
  throw new Error('oauth_token を取得できませんでした')
}
const token = tokenMatch[1]

async function main() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: true, previews_enabled: true }),
    },
  )
  const payload = await response.json()
  if (!response.ok || payload?.success !== true) {
    throw new Error(`workers.dev有効化に失敗しました: ${JSON.stringify(payload)}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
NODE

echo ""
echo "remote deploy completed."
echo "Fixed URL: ${remote_origin}"
echo "OAuth callback: ${remote_origin}/api/auth/github/callback"
echo "Withings callback: ${remote_origin}/api/withings/auth/callback"
echo "Withings notify: ${remote_origin}/api/withings/notify"
