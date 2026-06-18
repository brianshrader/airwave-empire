# Deploy (canonical)

**Do not use** `scripts/deploy-production.sh` — it is retired.

## Quick reference

| Goal | Command |
|------|---------|
| Preview only (no remote changes) | `./deploy.sh --dry-run` |
| Full staging deploy | `DEPLOY_CONFIRM=1 ./deploy.sh` |
| API / server only | `DEPLOY_CONFIRM=1 DEPLOY_SKIP_AMPLIFY=1 ./deploy.sh` |
| Frontend zip only (no SSH backend) | `DEPLOY_CONFIRM=1 DEPLOY_SKIP_BACKEND=1 ./deploy.sh` |

**Real deploys require `DEPLOY_CONFIRM=1`**, a live server persistence audit, and typing **`yes`** at the prompt. Use `--yes` only for non-interactive runs you control (`DEPLOY_CONFIRM=1 DEPLOY_YES=1 ./deploy.sh`).

Requires: `npm`, `aws`, `jq`, `curl`, `zip`, `rsync`, SSH key at `keys/airwaveempirekey.pem`.

## What deploy does

1. **Build** — `VITE_GAME_SERVER_URL=https://api.airwaveempire.com npm run build`
2. **Amplify** — uploads `deploy.zip` to staging branch `d11e4bu75ja2xt` / `staging`
3. **Backup** — copies `~/airwave-persist` (and any non-symlinked app `data/` / `saves/`) to `~/backups/pre-deploy-<timestamp>` on the server
4. **Rsync backend** — allowlisted paths only; **no `--delete` on app root**
5. **`dist/` only** — `--delete` is scoped to `dist/` so stale hashed assets are removed without touching persistence
6. **`server-deploy.sh`** — symlinks persistence to `~/airwave-persist`, `npm ci`, `pm2 reload`

## Never synced from laptop → server

These are excluded via `scripts/deploy-rsync-excludes.txt`:

- `data/` (cloud saves, Stripe mapping, AI quotas)
- `saves/` (multiplayer rooms)
- `generated-*` (logos, jingles, vans, portraits)
- `ecosystem.config.local.cjs`, `.env`, `keys/`

Shipped game-design JSON (`data/*.v1.json`) is synced **explicitly** as individual files.

## Persistence layout (production)

`scripts/server-deploy.sh` on the server:

- Stores durable state under **`~/airwave-persist/`** (`WL_PERSIST_ROOT`)
- Symlinks `~/airwave-empire/data`, `saves`, `generated-*` → persist root
- Sets `WL_PERSIST_ROOT` in `ecosystem.config.local.cjs` (created if missing)
- Secrets remain in **`/home/admin/secrets/airwave.env`** (`WL_ENV_FILE`)

Node reads paths via `server/runtimePaths.js` (honours `WL_PERSIST_ROOT` / per-dir overrides).

## Pre-deploy checklist

1. `./deploy.sh --dry-run` — review rsync output (no confirm gate)
2. `DEPLOY_CONFIRM=1 ./deploy.sh` — audit + type `yes` before any remote write
3. Prefer first real run: `DEPLOY_CONFIRM=1 DEPLOY_SKIP_AMPLIFY=1 ./deploy.sh` (API only)
4. Optional: `DEPLOY_SKIP_BACKUP=1` only if you already have a fresh backup
5. After deploy: smoke-test cloud save load, account/billing page, one AI generation quota

## Environment overrides

| Variable | Default |
|----------|---------|
| `DEPLOY_REMOTE_HOST` | `3.18.148.115` |
| `DEPLOY_SSH_KEY` | `keys/airwaveempirekey.pem` |
| `DEPLOY_PERSIST_ROOT` | `~/airwave-persist` |
| `DEPLOY_AMPLIFY_BRANCH` | `staging` |
| `DEPLOY_VITE_GAME_SERVER_URL` | `https://api.airwaveempire.com` |
| `DEPLOY_CONFIRM` | unset = abort; set to `1` to allow real deploy |
| `DEPLOY_YES` | `1` skips typing `yes` (still requires `DEPLOY_CONFIRM=1`) |

## Manual SSH

```bash
./scripts/connect-airwave.sh
cd ~/airwave-empire
pm2 logs airwave-empire
```

## Generated asset GC (not part of deploy)

`npm run gc:generated-assets` deletes **unreferenced** old logos/jingles. Always dry-run first:

```bash
node scripts/gc-generated-assets.js --dry-run
```

Pins paths referenced in `saves/` and `data/cloud_saves/`.
