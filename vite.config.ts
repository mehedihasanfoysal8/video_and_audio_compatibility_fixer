import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, renameSync } from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        // Copy manifest
        copyFileSync('manifest.json', 'dist/manifest.json');
        // Copy icons
        const iconsDir = 'dist/icons';
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
        ['16', '48', '128'].forEach((size) => {
          const src = `public/icons/icon${size}.png`;
          if (existsSync(src)) copyFileSync(src, `${iconsDir}/icon${size}.png`);
        });
        // Move HTML files from dist/src/... to dist/popup/ and dist/player/
        const htmlMoves: [string, string][] = [
          ['dist/src/popup/index.html', 'dist/popup/index.html'],
          ['dist/src/player/index.html', 'dist/player/index.html'],
        ];
        for (const [from, to] of htmlMoves) {
          if (existsSync(from)) {
            const dir = to.replace('/index.html', '');
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            copyFileSync(from, to);
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/index.html'),
        player: resolve(__dirname, 'player/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/service-worker.js';
          if (chunkInfo.name === 'content') return 'content/content-script.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
