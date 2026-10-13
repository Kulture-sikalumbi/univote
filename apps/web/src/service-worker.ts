// This project uses vite-plugin-pwa in "generateSW" mode (see vite.config.ts),
// which means Workbox generates the actual service worker file at build time
// from the `workbox` options passed to `VitePWA({...})` — precaching the
// built assets, plus the StaleWhileRevalidate (static assets) and
// NetworkFirst (/api/*) runtime caching rules, and the offline fallback page.
//
// Because of that, there is no hand-written service worker source for the
// bundler to consume here. This file is intentionally left as documentation
// so the project structure matches the spec, and so a future contributor
// knows where to look if the caching strategy ever needs to move to the
// more manual "injectManifest" strategy (which would replace this stub with
// real `workbox-precaching` / `workbox-routing` / `workbox-strategies` code
// and reference `self.__WB_MANIFEST` for precaching).
//
// The service worker is registered at runtime from src/main.tsx via
// `virtual:pwa-register`.
export {};
