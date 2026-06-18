#!/usr/bin/env bash
# Shared deploy helpers — source from deploy.sh (do not run directly).

deploy_require_tools() {
  local missing=0
  for cmd in npm rsync ssh aws jq curl zip; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing required command: $cmd" >&2
      missing=1
    fi
  done
  if [[ ! -f "$DEPLOY_SSH_KEY" ]]; then
    echo "SSH key not found: $DEPLOY_SSH_KEY" >&2
    missing=1
  fi
  if [[ ! -f "$DEPLOY_RSYNC_EXCLUDES_FILE" ]]; then
    echo "Exclude file not found: $DEPLOY_RSYNC_EXCLUDES_FILE" >&2
    missing=1
  fi
  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
}

deploy_rsync_opts() {
  RSYNC_DRY=()
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    RSYNC_DRY=(--dry-run)
    echo "==> DRY RUN: rsync will not modify the remote"
  fi
  RSYNC_EXCLUDES=(--exclude-from="$DEPLOY_RSYNC_EXCLUDES_FILE")
  RSYNC_SSH=(-e "$(deploy_rsync_ssh)")
}

# bash 3.2 + set -u treats empty "${arr[@]}" as unbound — append optional rsync flags safely.
deploy_rsync_cmd() {
  if [[ ${#RSYNC_DRY[@]} -gt 0 ]]; then
    rsync -avz "${RSYNC_DRY[@]}" "$@"
  else
    rsync -avz "$@"
  fi
}

# Lightweight backup of persistence before backend sync (skipped on dry-run).
deploy_backup_persistence() {
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    echo "==> DRY RUN: skipping remote persistence backup"
    return 0
  fi
  if [[ "${DEPLOY_SKIP_BACKUP:-}" == "1" ]]; then
    echo "==> Skipping remote persistence backup (DEPLOY_SKIP_BACKUP=1)"
    return 0
  fi
  local stamp
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  echo "==> Backing up server persistence to ~/backups/pre-deploy-$stamp"
  deploy_ssh "bash -s" <<EOF
set -euo pipefail
BACKUP_ROOT="\$HOME/backups/pre-deploy-$stamp"
mkdir -p "\$BACKUP_ROOT"
if [[ -d "$DEPLOY_PERSIST_ROOT" ]]; then
  cp -a "$DEPLOY_PERSIST_ROOT" "\$BACKUP_ROOT/persist-root"
  echo "  backed up $DEPLOY_PERSIST_ROOT"
fi
APP="$DEPLOY_REMOTE_DIR"
for dir in data saves generated-logos generated-portraits generated-jingles generated-remote-vans; do
  target="\$APP/\$dir"
  if [[ -e "\$target" && ! -L "\$target" ]]; then
    cp -a "\$target" "\$BACKUP_ROOT/\$dir"
    echo "  backed up \$target"
  fi
done
echo "Backup complete: \$BACKUP_ROOT"
EOF
}

# Sync application code only — NO --delete on app root (never wipe server-only paths).
deploy_rsync_backend() {
  deploy_rsync_opts
  local remote="${DEPLOY_REMOTE_USER}@${DEPLOY_REMOTE_HOST}:${DEPLOY_REMOTE_DIR}/"

  echo "==> Syncing backend allowlist to $remote"
  echo "    (no --delete on app root; persistence excluded via $(basename "$DEPLOY_RSYNC_EXCLUDES_FILE"))"

  # Application code & static shells
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/server/" "$remote/server/"
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/scripts/" "$remote/scripts/"
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/src/" "$remote/src/"
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/public/" "$remote/public/"
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/legal/" "$remote/legal/"

  # Shipped game-design JSON (not user data/)
  deploy_rsync_cmd "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/data/formatFamilies.v1.json" \
    "$DEPLOY_ROOT_DIR/data/formatLifecycle.v1.json" \
    "$DEPLOY_ROOT_DIR/data/spanishFormats.v1.json" \
    "$remote/data/"

  # Root entrypoints & manifests
  deploy_rsync_cmd "${RSYNC_EXCLUDES[@]}" "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/server.js" \
    "$DEPLOY_ROOT_DIR/package.json" \
    "$DEPLOY_ROOT_DIR/package-lock.json" \
    "$DEPLOY_ROOT_DIR/ecosystem.config.cjs" \
    "$DEPLOY_ROOT_DIR/vite.config.js" \
    "$DEPLOY_ROOT_DIR/index.html" \
    "$DEPLOY_ROOT_DIR/play.html" \
    "$DEPLOY_ROOT_DIR/play-guest.html" \
    "$DEPLOY_ROOT_DIR/play-signin.html" \
    "$DEPLOY_ROOT_DIR/pricing.html" \
    "$DEPLOY_ROOT_DIR/account.html" \
    "$remote"

  # Versioned server deploy hook (replaces opaque server-only copy)
  deploy_rsync_cmd "${RSYNC_SSH[@]}" \
    "$DEPLOY_ROOT_DIR/scripts/server-deploy.sh" \
    "$remote/server-deploy.sh"

  # dist/ — build artifact; --delete scoped to dist/ only
  echo "==> Syncing dist/ (delete stale hashed assets inside dist/ only)"
  if [[ ${#RSYNC_DRY[@]} -gt 0 ]]; then
    rsync -avz --delete "${RSYNC_DRY[@]}" "${RSYNC_SSH[@]}" \
      "$DEPLOY_ROOT_DIR/dist/" "$remote/dist/"
  else
    rsync -avz --delete "${RSYNC_SSH[@]}" \
      "$DEPLOY_ROOT_DIR/dist/" "$remote/dist/"
  fi
}

deploy_run_server_deploy() {
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    echo "==> DRY RUN: would run server-deploy.sh on remote"
    return 0
  fi
  echo "==> Running server-deploy.sh on remote"
  deploy_ssh "cd $DEPLOY_REMOTE_DIR && chmod +x ./server-deploy.sh && WL_PERSIST_ROOT=$DEPLOY_PERSIST_ROOT ./server-deploy.sh"
}

deploy_amplify_frontend() {
  if [[ "${DEPLOY_SKIP_AMPLIFY:-}" == "1" ]]; then
    echo "==> Skipping Amplify (DEPLOY_SKIP_AMPLIFY=1)"
    return 0
  fi
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    echo "==> DRY RUN: would upload deploy.zip to Amplify $DEPLOY_AMPLIFY_BRANCH"
    return 0
  fi

  echo "==> Deploying frontend ZIP to Amplify ($DEPLOY_AMPLIFY_BRANCH)"
  local deploy_json job_id upload_url
  deploy_json="$(aws amplify create-deployment \
    --app-id "$DEPLOY_AMPLIFY_APP_ID" \
    --branch-name "$DEPLOY_AMPLIFY_BRANCH" \
    --region "$DEPLOY_AWS_REGION")"
  job_id="$(echo "$deploy_json" | jq -r '.jobId')"
  upload_url="$(echo "$deploy_json" | jq -r '.zipUploadUrl')"
  curl -fsS -T "$DEPLOY_ROOT_DIR/deploy.zip" "$upload_url"
  aws amplify start-deployment \
    --app-id "$DEPLOY_AMPLIFY_APP_ID" \
    --branch-name "$DEPLOY_AMPLIFY_BRANCH" \
    --job-id "$job_id" \
    --region "$DEPLOY_AWS_REGION"
  echo "Amplify deployment started: job $job_id"
}

# Read-only SSH snapshot of user data on the server (shown before confirm).
deploy_print_persistence_audit() {
  echo ""
  echo "==> Server persistence audit (read-only)"
  deploy_ssh "bash -s" <<EOF
set -euo pipefail
APP="\$HOME/airwave-empire"
PERSIST="$DEPLOY_PERSIST_ROOT"
echo "Host: $DEPLOY_REMOTE_HOST  App: \$APP"
for dir in data saves generated-logos generated-portraits generated-jingles generated-remote-vans; do
  p="\$APP/\$dir"
  if [ -L "\$p" ]; then
    echo "  \$dir: symlink -> \$(readlink "\$p")"
  elif [ -d "\$p" ]; then
    n=\$(find "\$p" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "  \$dir: directory (\$n files)"
  elif [ -e "\$p" ]; then
    echo "  \$dir: present (not a directory)"
  else
    echo "  \$dir: missing"
  fi
done
if [[ -d "\$PERSIST" ]]; then
  echo "  persist root: \$PERSIST (exists)"
else
  echo "  persist root: \$PERSIST (not yet — first deploy migrates + symlinks)"
fi
if [ -f "\$APP/data/stripe_customers.json" ]; then
  echo "  stripe_customers.json: present"
fi
if [ -d "\$APP/data/cloud_saves" ]; then
  users=\$(find "\$APP/data/cloud_saves" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  saves=\$(find "\$APP/data/cloud_saves" -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  echo "  cloud_saves: \$users account dirs, \$saves save files"
fi
if [ -d "\$APP/saves" ]; then
  rooms=\$(find "\$APP/saves" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  echo "  multiplayer saves/: \$rooms room files"
fi
EOF
}

# Blocks accidental production deploy unless DEPLOY_CONFIRM=1 and operator types yes.
deploy_require_confirm_env() {
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    return 0
  fi
  if [[ "${DEPLOY_CONFIRM:-}" != "1" ]]; then
    echo "" >&2
    echo "Deploy aborted: set DEPLOY_CONFIRM=1 to allow remote changes." >&2
    echo "" >&2
    echo "  Preview only:  ./deploy.sh --dry-run" >&2
    echo "  Real deploy:   DEPLOY_CONFIRM=1 ./deploy.sh" >&2
    echo "  API only:      DEPLOY_CONFIRM=1 DEPLOY_SKIP_AMPLIFY=1 ./deploy.sh" >&2
    echo "" >&2
    echo "See docs/DEPLOY.md" >&2
    exit 1
  fi
}

deploy_confirm_or_abort() {
  if [[ "${DEPLOY_DRY_RUN:-}" == "1" ]]; then
    return 0
  fi

  deploy_require_confirm_env

  deploy_print_persistence_audit

  echo ""
  echo "==> Planned remote actions"
  if [[ "${DEPLOY_SKIP_AMPLIFY:-}" != "1" ]]; then
    echo "  • Amplify staging ($DEPLOY_AMPLIFY_BRANCH): upload deploy.zip"
  else
    echo "  • Amplify: skipped (DEPLOY_SKIP_AMPLIFY=1)"
  fi
  if [[ "${DEPLOY_SKIP_BACKEND:-}" == "1" ]]; then
    echo "  • Backend: skipped (DEPLOY_SKIP_BACKEND=1)"
  else
    echo "  • Backup persistence → ~/backups/pre-deploy-<timestamp>"
    echo "  • Rsync code allowlist (no --delete on app root)"
    echo "  • Rsync dist/ only with --delete (stale hashed assets)"
    echo "  • Run server-deploy.sh (migrate to $DEPLOY_PERSIST_ROOT, npm ci, pm2 reload)"
  fi
  echo ""
  echo "Never synced from laptop (protected):"
  echo "  data/  saves/  generated-*  ecosystem.config.local.cjs  .env"
  echo ""

  if [[ "${DEPLOY_YES:-}" == "1" ]]; then
    echo "==> DEPLOY_YES=1 — skipping interactive prompt"
    return 0
  fi

  local reply
  read -r -p "Type yes to deploy to $DEPLOY_REMOTE_HOST: " reply
  if [[ "$reply" != "yes" ]]; then
    echo "Deploy cancelled (expected exactly: yes)" >&2
    exit 1
  fi
  echo ""
}
