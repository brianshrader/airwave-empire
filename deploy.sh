#!/usr/bin/env bash
# Canonical deploy — frontend (Amplify staging) + backend (Lightsail API).
# See docs/DEPLOY.md
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/deploy-config.sh
source "$ROOT_DIR/scripts/deploy-config.sh"
# shellcheck source=scripts/deploy-lib.sh
source "$ROOT_DIR/scripts/deploy-lib.sh"

deploy_require_tools

if [[ "${1:-}" == "--dry-run" ]]; then
  export DEPLOY_DRY_RUN=1
  shift
fi
if [[ "${1:-}" == "--skip-amplify" ]]; then
  export DEPLOY_SKIP_AMPLIFY=1
  shift
fi
if [[ "${1:-}" == "--skip-backend" ]]; then
  export DEPLOY_SKIP_BACKEND=1
  shift
fi
if [[ "${1:-}" == "--yes" ]]; then
  export DEPLOY_YES=1
  shift
fi

deploy_require_confirm_env

echo "==> Building production bundle"
VITE_GAME_SERVER_URL="$DEPLOY_VITE_GAME_SERVER_URL" npm run build

echo "==> Creating deploy.zip (Amplify)"
rm -f deploy.zip
(
  cd dist
  zip -rq ../deploy.zip .
)

deploy_confirm_or_abort

deploy_amplify_frontend

if [[ "${DEPLOY_SKIP_BACKEND:-}" == "1" ]]; then
  echo "==> Skipping backend (DEPLOY_SKIP_BACKEND=1)"
  echo "Done."
  exit 0
fi

deploy_backup_persistence
deploy_rsync_backend
deploy_run_server_deploy

echo "Done."
