import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

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
        next();
      });
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

export default defineConfig(({ command }) => ({
  root: '.',
  appType: 'mpa',
  plugins: [
    landingRedirectPlugin(),
    devOnlyMarketHarnessPlugin(command),
    {
      name: 'copy-legacy-and-logo-js',
      writeBundle() {
        const destDir = join(__dirname, 'dist', 'src');
        mkdirSync(destDir, { recursive: true });
        const copy = (name) =>
          copyFileSync(join(__dirname, 'src', name), join(destDir, name));
        copy('legacy.js');
        // index.html loads these as classic scripts (before legacy.js). Must exist in dist or production 404s and wlStationLogoSvg never mounts.
        copy('stationLogoConfig.js');
        copy('stationLogoSvg.js');
        // inspect-shares.html (share calibration batch tool)
        copy('marketSimHarness.js');
        copy('inspectSharesBoot.js');
        copy('inspectPublicRadioBoot.js');
        copy('inspectMarketHealthBoot.js');
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
    // Top-level await in src/main.js (Clerk init before legacy.js)
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        'inspect-shares': resolve(__dirname, 'inspect-shares.html'),
        'inspect-public-radio': resolve(__dirname, 'inspect-public-radio.html'),
        'inspect-market-health': resolve(__dirname, 'inspect-market-health.html'),
      },
    },
  },
}));
