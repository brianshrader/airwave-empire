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

export default defineConfig({
  root: '.',
  appType: 'mpa',
  plugins: [
    landingRedirectPlugin(),
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
      },
    },
  },
});
