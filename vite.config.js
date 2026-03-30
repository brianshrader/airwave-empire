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
      name: 'copy-legacy-js',
      writeBundle() {
        const destDir = join(__dirname, 'dist', 'src');
        mkdirSync(destDir, { recursive: true });
        copyFileSync(join(__dirname, 'src', 'legacy.js'), join(destDir, 'legacy.js'));
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
