import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Tauri sets TAURI_ENV_PLATFORM during `tauri dev/build`; the service worker is
// not needed inside the desktop shell because every asset is bundled.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  plugins: [
    react(),
    VitePWA({
      disable: isTauri,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'CAD Wizard',
        short_name: 'CAD Wizard',
        description: 'Lightweight parametric CAD that works offline',
        theme_color: '#1d2127',
        background_color: '#1d2127',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The kernel WASM (~43 MB raw) must be precached for offline parity (REQ-002).
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
