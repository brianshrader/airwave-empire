import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  appType: 'spa',
  plugins: [
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
  },
});
