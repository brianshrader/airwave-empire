#!/usr/bin/env bash
# Production server post-rsync — run ON the Lightsail host (also synced from repo).
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PERSIST_ROOT="${WL_PERSIST_ROOT:-$HOME/airwave-persist}"
# Legacy deploys passed /var/lib/... — fall back if not writable without root.
if ! mkdir -p "$PERSIST_ROOT" 2>/dev/null; then
  echo "WARN: cannot write $PERSIST_ROOT — using $HOME/airwave-persist" >&2
  PERSIST_ROOT="$HOME/airwave-persist"
  mkdir -p "$PERSIST_ROOT"
fi
export WL_PERSIST_ROOT="$PERSIST_ROOT"

echo "==> server-deploy: app=$APP_DIR persist=$PERSIST_ROOT"

# ── Move durable state outside the deploy tree (symlink into app dir) ─────────
PERSIST_DIRS=(data saves generated-logos generated-portraits generated-jingles generated-remote-vans)

if [[ "$(id -u)" -eq 0 ]]; then
  mkdir -p "$PERSIST_ROOT"
  chown -R "${SUDO_USER:-admin}:$(id -gn "${SUDO_USER:-admin}")" "$PERSIST_ROOT" 2>/dev/null || true
else
  mkdir -p "$PERSIST_ROOT"
fi

for dir in "${PERSIST_DIRS[@]}"; do
  persist_path="$PERSIST_ROOT/$dir"
  app_path="$APP_DIR/$dir"
  mkdir -p "$persist_path"

  if [[ -d "$app_path" && ! -L "$app_path" ]]; then
    if [[ -n "$(ls -A "$app_path" 2>/dev/null || true)" ]]; then
      echo "  migrating $app_path -> $persist_path"
      cp -an "$app_path/." "$persist_path/" 2>/dev/null || cp -a "$app_path/." "$persist_path/"
    fi
    rm -rf "$app_path"
  fi

  if [[ ! -e "$app_path" ]]; then
    ln -sfn "$persist_path" "$app_path"
    echo "  linked $app_path -> $persist_path"
  elif [[ -L "$app_path" ]]; then
    echo "  ok: $app_path -> $(readlink "$app_path")"
  fi
done

# ── PM2 env pointer (secrets stay in /home/admin/secrets/airwave.env) ─────────
LOCAL_PM2="ecosystem.config.local.cjs"
if [[ ! -f "$LOCAL_PM2" ]]; then
  cat > "$LOCAL_PM2" <<EOF
/** Auto-created by server-deploy.sh — do not commit */
module.exports = {
  env_production: {
    WL_ENV_FILE: '/home/admin/secrets/airwave.env',
    WL_PERSIST_ROOT: '$PERSIST_ROOT',
  },
};
EOF
  echo "  created $LOCAL_PM2 (WL_PERSIST_ROOT + WL_ENV_FILE)"
fi

# ── Dependencies & process manager ────────────────────────────────────────────
if [[ -f package-lock.json ]] && npm ci --omit=dev 2>/dev/null; then
  :
else
  echo "==> npm ci skipped or failed — running npm install --omit=dev"
  npm install --omit=dev
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe airwave-empire >/dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --env production --update-env
  else
    pm2 start ecosystem.config.cjs --env production
  fi
  pm2 save || true
else
  echo "WARN: pm2 not installed — start server manually: NODE_ENV=production node server.js" >&2
fi

echo "==> server-deploy complete"
