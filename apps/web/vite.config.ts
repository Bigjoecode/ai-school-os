import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { serviceWorker } from './src/pwa/vite-plugin';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: {
      '@aischool/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // School websites on their own domains: *.localhost exercises host mode in development.
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the production build (with its service worker) against the local API.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    // No manual chunks: hand-written vendor splits created circular chunks that ran
    // before React loaded (a blank page). Rollup's own splitting orders them safely.
  },
});
