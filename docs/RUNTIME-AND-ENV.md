# Runtime entry points, environment, and deploy notes

This document lists **canonical** paths for the Airwave Empire / `airwave-empire` server and Vite client, how configuration is validated, and operational risks (especially persistence).

## Server (Node)

| Role | Entry file | Start command |
|------|------------|----------------|
| HTTP API + Socket.io game server | `server.js` | `npm start` or `node server.js` |
| Dev with auto-restart | same | `npm run dev` (`node --watch server.js`) |
| PM2 (production) | `ecosystem.config.cjs` → `server.js` | `npm run pm2:start` / `pm2 reload …` |

**Load order:** `.env` in the project root, then optional `WL_ENV_FILE` (override). **`server/validateEnv.js`** runs immediately after — the process **exits** if multiplayer auth configuration is invalid (see below).

**Major mounts (from `server.js`):** CORS, Stripe webhook + billing (`server/stripeBilling.js`), logo / remote van / portrait routes, cloud saves (`server/cloudSaves.js`), feedback, analytics, ratings digest, jingles, then **Socket.io** with `server/mpAuth.js`.

## Client (browser)

| Role | Entry | Build |
|------|-------|--------|
| Marketing / landing | `index.html` | `vite build` → `dist/index.html` |
| Game shell (Clerk + bundled UI + legacy game) | `play.html` | `vite build` → `dist/play.html` |
| Dev server (proxies `/api`, `/socket.io` to port 3000) | same sources | `npm run client:dev` (Vite on 5173) |

**Vite inputs** are listed in `vite.config.js` → `build.rollupOptions.input` (play, inspect tools, index).

## Multiplayer (Socket.io)

- Connections are accepted by the `Server` attached in `server.js`.
- **Auth middleware:** `server/mpAuth.js` — verifies Clerk JWT from `socket.handshake.auth.token` when `CLERK_SECRET_KEY` is set.
- **Spectators** (`auth.spectate === true` without a token) stay allowed when Clerk is configured (read-only path in `mpAuth.js`).

## Multiplayer auth policy (enforced at startup)

| `NODE_ENV` | `CLERK_SECRET_KEY` | `WL_ALLOW_MP_AUTH_BYPASS=1` | Result |
|------------|-------------------|------------------------------|--------|
| `production` | set | ignored | Server starts; Clerk verifies tokens. |
| `production` | missing | — | **Process exits** — production cannot run without Clerk. |
| `production` | any | **set** | **Process exits** — bypass is forbidden in production. |
| not `production` | set | — | Server starts; Clerk verifies when key present. |
| not `production` | missing | **set** | Server starts; Socket.io allows connections without JWT (local/LAN only). |
| not `production` | missing | unset | **Process exits** — avoids silent open multiplayer. |

## Environment validation (centralized)

**File:** `server/validateEnv.js`

- **Fatal (exit):** Production without `CLERK_SECRET_KEY`; non-production without `CLERK_SECRET_KEY` and without `WL_ALLOW_MP_AUTH_BYPASS=1`.
- **Warnings:** Stripe secret key without webhook secret (or the reverse) — billing/webhook routes may return 503 until both are set where needed.

Optional services (AI keys, PostHog, digest providers) are **not** required to boot; they degrade specific routes or features.

## Persistence paths (`server/runtimePaths.js`)

| Env | Default | Purpose |
|-----|---------|---------|
| `WL_PERSIST_ROOT` | app root (dev) / `~/airwave-persist` (prod via `server-deploy.sh`) | Base for user state |
| `WL_DATA_DIR` | `<persist>/data` | Cloud saves, Stripe map, AI quotas |
| `WL_SAVES_DIR` | `<persist>/saves` | Multiplayer room JSON |
| `WL_GENERATED_*_DIR` | `<persist>/generated-*` | Player logos, jingles, vans, portraits |

Shipped catalogs (`data/formatLifecycle.v1.json`, etc.) always load from **app root** (`GAME_DATA_DIR`), not persist root.

## Cloud saves (solo, account-scoped)

- **Implementation:** `server/cloudSaves.js`
- **Disk path:** `data/cloud_saves/<sanitized-clerk-user-id>/` (see `safeUid()` in that file). **`data/` is gitignored** — it is **runtime state**, not part of the repo.
- **Requirements:** `CLERK_SECRET_KEY` on the server for Bearer verification; optional Stripe gating via `server/subscriptionAccess.js` when Stripe is configured.

### Redeploy / data-loss risk

Deploy is documented in **`docs/DEPLOY.md`**. `deploy.sh` never uses `rsync --delete` on the app root; persistence lives under **`WL_PERSIST_ROOT`** (default `~/airwave-persist` on production) via `server/runtimePaths.js` and symlinks created by `scripts/server-deploy.sh`.

If the host **replaces the entire app directory** without that layout:

- **Cloud saves will be lost** (or reset to empty) because they live under `data/cloud_saves/`.
- **Room saves** under `./saves/` have the same class of risk if that directory is not persisted.

**Mitigation:** Persist `data/` (and `saves/` if you care about multiplayer room recovery) on a volume, bind-mount, or host path that survives deploys; or sync backups before replacing the app.

## `dist/` — commit policy (recommendation)

| Approach | When to use |
|----------|-------------|
| **Do not commit `dist/`** | CI or the server runs `npm run build` on deploy; single source of truth is source + lockfile. Cleaner git history; requires Node on deploy. |
| **Commit `dist/`** | Static hosting that only serves files (no build step), or you intentionally ship a known built artifact. Expect **hash churn** on every build (`assets/play-*.js`). |

The repo may already commit `dist/` for historical or hosting reasons — either model works if the deploy story is explicit. Prefer **one** policy per environment to avoid stale assets.

## Vite `writeBundle`: why legacy scripts are copied

`vite.config.js` includes a plugin that **`copyFileSync`** selected files from `src/` into `dist/src/` after the Rollup build.

**Reason:** `play.html` and several **inspect** HTML pages load **non-module** scripts (`<script src="/src/legacy.js">` without `type="module"`). Vite does not bundle those as ES modules; Rollup’s multi-page build only processes `type="module"` entries. Without copying, production would **404** on `/src/legacy.js`, `/src/stationLogoSvg.js`, `/src/gmMode.js`, etc.

**Still required in `dist/src/` for production play + tools:**

- `legacy.js`, `gmMode.js`, `campaignMode.js` — game logic and modes referenced from HTML.
- `stationLogoConfig.js`, `stationLogoSvg.js` — logo pipeline used before/with legacy.
- `styles.css` — legal pages and shared theme path `/src/styles.css`.
- Inspect bootstraps (`inspectSharesBoot.js`, `inspectPublicRadioBoot.js`, …) and harness files listed in `vite.config.js` for each inspect page.

The build log warning *“can't be bundled without type=module”* for those tags is **expected**; the copy step is the supported workaround.

## Archived duplicate filenames

Accidental Finder duplicates (`* 2.*`) were moved to **`archive/duplicate-name-copies/`** with a README. They are not referenced by build or runtime.
