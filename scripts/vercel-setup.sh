#!/usr/bin/env bash
# Link the project and push every environment variable to Vercel.
#
#   vercel login            # interactive, do this first
#   bash scripts/vercel-setup.sh
#   vercel --prod
#
# Idempotent: re-running overwrites each value rather than erroring on duplicates.
# Reads nothing secret — BURNER_PRIVATE_KEY is deliberately NEVER sent. A deployed
# frontend does not sign; the user's wallet does.
set -euo pipefail

command -v vercel >/dev/null || { echo "vercel CLI not found: npm i -g vercel"; exit 1; }
vercel whoami >/dev/null 2>&1 || { echo "Not logged in. Run: vercel login"; exit 1; }

NOTE_ADDRESS="${NEXT_PUBLIC_ANKER_NOTE_ADDRESS:-0x863b54bb144cec7ae73d56983193e2e5a60652e3}"
REPO_URL="${NEXT_PUBLIC_REPO_URL:-https://github.com/Aaditya1273/linger}"
INDEXER="https://dev.smk.somnia.host/v1/graphql"
RPC="https://dream-rpc.somnia.network"
WS="wss://dream-rpc.somnia.network/ws"

# WalletConnect id: taken from the environment or .env.local, never hard-coded.
WC="${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}"
if [ -z "$WC" ] && [ -f .env.local ]; then
  WC="$(grep -oE '^(NEXT_PUBLIC_)?WALLET_?CONNECT_PROJECT_ID=.*' .env.local | head -1 | cut -d= -f2- || true)"
fi
[ -z "$WC" ] && echo "  note: no WalletConnect project id found — injected wallets will still work."

echo "▸ linking project (accept the prompts once) …"
vercel link --yes >/dev/null

# The deployment URL is not known until the first deploy, so SITE_URL is seeded
# with the production alias Vercel will assign and can be corrected afterwards.
PROJECT="$(node -p "require('./.vercel/project.json').projectId" 2>/dev/null || echo '')"
SITE_URL="${NEXT_PUBLIC_SITE_URL:-}"
if [ -z "$SITE_URL" ]; then
  SITE_URL="https://$(basename "$PWD").vercel.app"
  echo "  note: NEXT_PUBLIC_SITE_URL defaulted to $SITE_URL — fix it after the first deploy if the alias differs."
fi

put() {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  for env in production preview; do
    # Remove first so a re-run overwrites instead of failing on a duplicate.
    vercel env rm "$name" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$name" "$env" >/dev/null
  done
  echo "  set $name"
}

echo "▸ pushing environment variables …"
put NEXT_PUBLIC_SITE_URL                  "$SITE_URL"
put NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID  "$WC"
put NEXT_PUBLIC_ANKER_NOTE_ADDRESS        "$NOTE_ADDRESS"
put NEXT_PUBLIC_REPO_URL                  "$REPO_URL"
put INDEXER_URL                           "$INDEXER"
put SOMNIA_RPC                            "$RPC"
put WS_RPC                                "$WS"
put NEXT_PUBLIC_INDEXER_URL               "$INDEXER"
put NEXT_PUBLIC_SOMNIA_RPC                "$RPC"
put NEXT_PUBLIC_WS_RPC                    "$WS"

echo
echo "  Done. Now deploy:"
echo "    vercel --prod"
echo
echo "  If the build fails at install, set the Install Command in the Vercel"
echo "  dashboard to:  npm install --legacy-peer-deps"
