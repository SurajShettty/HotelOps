/// <reference lib="webworker" />
/// <reference lib="esnext" />

// Type-checked on its own via tsconfig.worker.json — see the note on
// tsconfig.json's "exclude" for why this can't share the app's main
// TypeScript program.

import { defaultCache } from '@serwist/next/worker';
import { NetworkOnly, Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: ServiceWorkerGlobalScope;

// Only ever registered from apps/web/app/hk/hk-shell.tsx, and served at
// /hk/sw.js (see next.config.mjs), so its default scope is capped at /hk/
// even before the explicit `scope: '/hk'` passed at registration time — no
// other route in the app is ever controlled by this worker.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').origin;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Must come first — Workbox/Serwist routes match in order, first match
    // wins. Task data must always be live: a housekeeper acting on a cached
    // room/task list could clean the wrong room or miss a nudge.
    { matcher: ({ url }) => url.origin === apiOrigin, handler: new NetworkOnly() },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
