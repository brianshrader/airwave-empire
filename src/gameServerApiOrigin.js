/**
 * Browser calls to `/api/*` must hit the Node host when static HTML is on another origin (e.g. Amplify + Lightsail).
 * Set `VITE_GAME_SERVER_URL` at build time (no trailing slash), or set `window.__WL_GAME_SERVER_URL` from play/main.
 * On Vite dev (:5173), a different origin than the page is ignored so `/api` stays same-origin → Vite proxy.
 */
export function gameServerApiOrigin() {
  try {
    if (typeof window === 'undefined') return '';
    const fromWindow = window.__WL_GAME_SERVER_URL && String(window.__WL_GAME_SERVER_URL).trim();
    const fromEnv = import.meta.env?.VITE_GAME_SERVER_URL?.trim?.() ?? '';
    const raw = fromWindow || fromEnv;
    if (!raw) return '';
    const abs = String(raw).replace(/\/$/, '');
    const loc = window.location;
    if (loc && loc.port === '5173' && abs.startsWith('http')) {
      try {
        const ou = new URL(abs);
        if (ou.origin !== loc.origin) return '';
      } catch (_e) {
        return '';
      }
    }
    return abs;
  } catch (_e) {
    return '';
  }
}

export function gameServerApiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const o = gameServerApiOrigin();
  return o ? `${o}${p}` : p;
}
