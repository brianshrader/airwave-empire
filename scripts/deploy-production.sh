#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ZIP_PATH="$ROOT_DIR/deploy.zip"

REMOTE_USER="admin"
REMOTE_HOST="3.18.148.115"
REMOTE_DIR="~/airwave-empire/"
SSH_KEY="/Users/brianshrader/Documents/Games/Cursor/Frequencies/keys/LightsailDefaultKey-us-east-2.pem"

API_URL="https://api.airwaveempire.com"

echo "==> Building production bundle"
cd "$ROOT_DIR"
VITE_GAME_SERVER_URL="$API_URL" npm run build

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Build failed: dist directory not found."
  exit 1
fi

echo "==> Creating deploy.zip"
rm -f "$ZIP_PATH"
(
  cd "$DIST_DIR"
  zip -rq "$ZIP_PATH" .
)

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Zip failed: deploy.zip was not created."
  exit 1
fi

echo "==> Uploading dist contents to $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'generated-logos' \
  --exclude 'generated-portraits' \
  --exclude 'saves' \
  --exclude '.DS_Store' \
  -e "ssh -i $SSH_KEY" \
  "$DIST_DIR"/ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

echo "==> Done"
echo "Local archive: $ZIP_PATH"
