import withSerwistInit from '@serwist/next';

// Service worker is scoped to /hk only (see apps/web/app/sw.ts and
// apps/web/app/hk/hk-shell.tsx) — register:false means it's never
// auto-injected into every page; the /hk shell registers it manually.
// Disabled in dev to avoid stale-cache footguns while iterating.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/hk/sw.js',
  swUrl: '/hk/sw.js',
  scope: '/hk',
  register: false,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withSerwist(nextConfig);
