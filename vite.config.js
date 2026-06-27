import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Old /landing URL → site root (marketing page). */
function landingRedirectPlugin() {
  return {
    name: 'airwave-landing-redirect',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0];
        if (pathOnly === '/landing' || pathOnly === '/landing/') {
          res.writeHead(302, { Location: '/' });
          res.end();
          return;
        }
        /* Clean URLs mirror production Express routes → same HTML entry as *.html */
        const cleanToHtml = [
          ['/pricing', '/pricing.html'],
          ['/account', '/account.html'],
          ['/play-signin', '/play-signin.html'],
          ['/play-guest', '/play-guest.html'],
        ];
        for (const [clean, htmlPath] of cleanToHtml) {
          if (pathOnly === clean || pathOnly === clean + '/') {
            const q = req.url.includes('?') ? '?' + (req.url.split('?')[1] || '') : '';
            req.url = htmlPath + q;
            break;
          }
        }
        if (pathOnly === '/terms' || pathOnly === '/terms/') {
          try {
            const html = readFileSync(join(__dirname, 'legal', 'terms.html'), 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          } catch (_e) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
        }
        if (pathOnly === '/privacy' || pathOnly === '/privacy/') {
          try {
            const html = readFileSync(join(__dirname, 'legal', 'privacy.html'), 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          } catch (_e) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
        }
        next();
      });
    },
  };
}

/**
 * Injects `<meta name="wl-require-clerk" content="…">` in play.html so you do not edit the file per deploy.
 * Defaults: `development` → 0 (no Clerk gate in Vite dev), `production` build → 1.
 * Override: `VITE_WL_REQUIRE_CLERK_META=0|1` in `.env.*` (see .env.example).
 */
function playHtmlClerkMetaPlugin(mode, env) {
  const ex = env.VITE_WL_REQUIRE_CLERK_META;
  const content = ex === '1' || ex === '0' ? ex : mode === 'development' ? '0' : '1';
  return {
    name: 'play-html-clerk-meta',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const pathStr = ctx?.path || ctx?.filename || '';
        if (pathStr.includes('play-guest')) return html;
        if (!html.includes('name="wl-require-clerk"')) return html;
        return html.replace(
          /<meta\s+name="wl-require-clerk"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="wl-require-clerk" content="${content}">`,
        );
      },
    },
  };
}

/** Inject API origin into play.html meta + MP lobby input (legacy.js is not Vite-bundled). */
function playHtmlGameServerUrlPlugin(mode, env) {
  const raw = (env.VITE_GAME_SERVER_URL || '').trim();
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  const localhost = 'http://localhost:3000';
  const inputValue = raw || (mode === 'development' ? localhost : '');
  const inputPlaceholder = raw || localhost;
  return {
    name: 'play-html-game-server-url',
    enforce: 'pre',
    transformIndexHtml(html) {
      if (!html.includes('name="wl-game-server-url"')) return html;
      let out = html.replace(
        /<meta\s+name="wl-game-server-url"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="wl-game-server-url" content="${raw ? esc(raw) : ''}">`,
      );
      out = out.replace(/<input id="mp-server-url"[\s\S]*?\/>/i, () =>
        `<input id="mp-server-url" class="mp-inp mp-inp--row" type="text" value="${esc(inputValue)}"\n          placeholder="${esc(inputPlaceholder)}"/>`,
      );
      return out;
    },
  };
}

/** Dev-only: `marketSimHarness.js` is not copied to dist; script tag stripped from HTML on `vite build`. */
function devOnlyMarketHarnessPlugin(command) {
  return {
    name: 'dev-only-market-sim-harness',
    transformIndexHtml(html) {
      if (command === 'build') {
        return html.replace(/\s*<script defer src="\/src\/marketSimHarness\.js"><\/script>\s*/i, '\n');
      }
      return html;
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  root: '.',
  appType: 'mpa',
  plugins: [
    landingRedirectPlugin(),
    playHtmlClerkMetaPlugin(mode, env),
    playHtmlGameServerUrlPlugin(mode, env),
    devOnlyMarketHarnessPlugin(command),
    // Non-module scripts referenced from play.html / inspect-*.html are not Rollup-bundled; copy into dist/src/
    // so production does not 404. See docs/RUNTIME-AND-ENV.md (section “Vite writeBundle: why legacy scripts are copied”).
    {
      name: 'copy-legacy-and-logo-js',
      writeBundle() {
        const destDir = join(__dirname, 'dist', 'src');
        mkdirSync(destDir, { recursive: true });
        const copy = (name) =>
          copyFileSync(join(__dirname, 'src', name), join(destDir, name));
        copy('legacy.js');
        copy('realismSpanishComposition.js');
        copy('marketEcologyCore.iife.js');
        copy('formatLifecycleProfileRuntime.iife.js');
        copy('talentRetention.js');
        copy('gmMode.js');
        copy('campaignMode.js');
        // index.html loads these as classic scripts (before legacy.js). Must exist in dist or production 404s and wlStationLogoSvg never mounts.
        copy('stationLogoConfig.js');
        copy('stationLogoSvg.js');
        // inspect-shares.html (share calibration batch tool)
        copy('marketSimHarness.js');
        copy('marketTraitProfile.js');
        copy('inspectSharesBoot.js');
        copy('inspectPublicRadioBoot.js');
        copy('inspectMarketHealthBoot.js');
        copy('inspectEcologyDeepBoot.js');
        copy('inspectFormatEcologyBoot.js');
        copy('inspectCashFlowBoot.js');
        copy('inspectScenarioProbeBoot.js');
        copy('inspectCashBridgeBoot.js');
        copy('inspectMegaSnapshotsBoot.js');
        copy('inspectRatingsCollapseBoot.js');
        copy('inspectLogoTemplatesBoot.js');
        copy('inspectMarketSnowballBoot.js');
        copy('marketSimHarnessSnowball.js');
        // Legal pages link /src/styles.css — Vite does not emit this path; copy so contact/terms/privacy match the game theme.
        copy('styles.css');
        const legalDir = join(__dirname, 'legal');
        if (existsSync(legalDir)) {
          const legalDest = join(__dirname, 'dist', 'legal');
          mkdirSync(legalDest, { recursive: true });
          for (const f of readdirSync(legalDir)) {
            if (f.endsWith('.html') || f.endsWith('.css')) {
              copyFileSync(join(legalDir, f), join(legalDest, f));
            }
          }
        }
      },
    },
  ],
  server: {
    // Listen on LAN (0.0.0.0) so you can open http://<your-machine-ip>:5173 from a phone on the same Wi‑Fi.
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
      '/generated-logos': { target: 'http://localhost:3000' },
      '/generated-portraits': { target: 'http://localhost:3000' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Top-level await in src/main.js — deferred legacy.js may still run first; play.html sets __WL_REQUIRE_CLERK in a sync head script from meta.
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        play: resolve(__dirname, 'play.html'),
        'play-guest': resolve(__dirname, 'play-guest.html'),
        'play-signin': resolve(__dirname, 'play-signin.html'),
        account: resolve(__dirname, 'account.html'),
      },
    },
  },
};
});
