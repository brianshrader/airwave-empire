'use strict';

/**
 * Shared CORS allowlist for Express (HTTP /api, static) and Socket.io.
 * Browser requests from the SPA origin must be listed here when API is on another host.
 */

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const PRODUCTION_DEFAULT_ORIGINS = [
  'https://airwaveempire.com',
  'https://www.airwaveempire.com',
];

function originsFromPublicAppUrl() {
  const raw = process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim();
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const out = [u.origin];
    const host = u.hostname;
    if (host && !host.startsWith('www.') && host.includes('.')) {
      out.push(`${u.protocol}//www.${host}`);
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function originsFromCorsOriginsEnv() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildAllowedOriginsList() {
  return [
    ...new Set([
      ...PRODUCTION_DEFAULT_ORIGINS,
      ...originsFromPublicAppUrl(),
      ...originsFromCorsOriginsEnv(),
      ...LOCAL_DEV_ORIGINS,
    ]),
  ];
}

let _cache;
function allowedOriginsList() {
  if (!_cache) _cache = buildAllowedOriginsList();
  return _cache;
}

function isAllowedOrigin(origin) {
  if (origin == null || origin === '') return true;
  return allowedOriginsList().includes(origin);
}

/**
 * Options for `require('cors')(opts)` — Express and Socket.io engine both use the `cors` package.
 * Preflight (OPTIONS) and POST with JSON are covered.
 */
function getSharedCorsOptions() {
  return {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  };
}

module.exports = {
  buildAllowedOriginsList,
  allowedOriginsList,
  isAllowedOrigin,
  getSharedCorsOptions,
};
