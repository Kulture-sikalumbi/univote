import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// UniVote web app — Vite dev server proxies /api to the local API server,
// and vite-plugin-pwa (generateSW strategy) builds the service worker.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We ship our own static public/manifest.json (linked from index.html)
      // instead of letting the plugin generate one.
      manifest: false,
      includeAssets: ['icons/*'],
      workbox: {
        // Serve the offline fallback page for navigations that fail due to
        // a total network failure (e.g. no connectivity at all).
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // JS / CSS / fonts: prefer cache, refresh in the background.
            urlPattern: ({ request }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'font',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
            },
          },
          {
            // API calls: try the network first, fall back to cache when offline.
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        // The API selects the institution from X-Tenant-Code; tenant routing
        // does not depend on the browser hostname.
        changeOrigin: false,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
});
