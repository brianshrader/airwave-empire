/**
 * PM2 — production process manager for the game server.
 *
 * Install (once on the server): npm install -g pm2
 *
 * First start:
 *   pm2 start ecosystem.config.cjs --env production
 *
 * After deploy / code pull:
 *   pm2 reload ecosystem.config.cjs --env production
 *
 * Survive reboot (run once after PM2 is installed):
 *   pm2 save
 *   pm2 startup
 *   (run the command it prints, then pm2 save again)
 *
 * Secrets: do not put real keys in git. On the server, create
 * ecosystem.config.local.cjs (gitignored) that exports { env_production: { CLERK_SECRET_KEY: '...', ... } }.
 * See comments at the bottom of this file.
 */
const fs = require('fs');
const path = require('path');

const app = {
  name: 'airwave-empire',
  cwd: __dirname,
  script: 'server.js',
  interpreter: 'node',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_restarts: 15,
  min_uptime: '5s',
  // Merge: default env (local dev). For Socket.io without Clerk, set WL_ALLOW_MP_AUTH_BYPASS=1 in ecosystem.config.local.cjs — never in production.
  env: {
    NODE_ENV: 'development',
  },
  env_production: {
    NODE_ENV: 'production',
  },
};

const localPath = path.join(__dirname, 'ecosystem.config.local.cjs');
if (fs.existsSync(localPath)) {
  const local = require(localPath);
  if (local.env && typeof local.env === 'object') {
    Object.assign(app.env, local.env);
  }
  if (local.env_production && typeof local.env_production === 'object') {
    Object.assign(app.env_production, local.env_production);
  }
}

module.exports = {
  apps: [app],
};

/*
 * ── ecosystem.config.local.cjs (on the server only; never commit) ─────────
 *
 * module.exports = {
 *   env_production: {
 *     CLERK_SECRET_KEY: 'sk_live_...',
 *     STRIPE_SECRET_KEY: 'sk_live_...',
 *     STRIPE_WEBHOOK_SECRET: 'whsec_...',
 *   },
 * };
 */
