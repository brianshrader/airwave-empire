# Shared deploy configuration — sourced by deploy.sh and deploy-lib.sh
# Override via environment: DEPLOY_REMOTE_HOST, DEPLOY_SSH_KEY, DEPLOY_SKIP_AMPLIFY=1, etc.

DEPLOY_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_REMOTE_USER="${DEPLOY_REMOTE_USER:-admin}"
DEPLOY_REMOTE_HOST="${DEPLOY_REMOTE_HOST:-3.18.148.115}"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/airwave-empire}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$DEPLOY_ROOT_DIR/keys/airwaveempirekey.pem}"
DEPLOY_PERSIST_ROOT="${DEPLOY_PERSIST_ROOT:-~/airwave-persist}"

DEPLOY_AMPLIFY_APP_ID="${DEPLOY_AMPLIFY_APP_ID:-d11e4bu75ja2xt}"
DEPLOY_AMPLIFY_BRANCH="${DEPLOY_AMPLIFY_BRANCH:-staging}"
DEPLOY_AWS_REGION="${DEPLOY_AWS_REGION:-us-east-1}"

DEPLOY_VITE_GAME_SERVER_URL="${DEPLOY_VITE_GAME_SERVER_URL:-https://api.airwaveempire.com}"

DEPLOY_RSYNC_EXCLUDES_FILE="$DEPLOY_ROOT_DIR/scripts/deploy-rsync-excludes.txt"

deploy_ssh() {
  ssh -i "$DEPLOY_SSH_KEY" "$DEPLOY_REMOTE_USER@$DEPLOY_REMOTE_HOST" "$@"
}

deploy_rsync_ssh() {
  echo "ssh -i $DEPLOY_SSH_KEY"
}
