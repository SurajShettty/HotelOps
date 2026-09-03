import type { Metadata, Viewport } from 'next';
import { HkShell } from './hk-shell';

// A plain server component (unlike (dashboard)/layout.tsx, which is
// 'use client' end-to-end) so it can export metadata/viewport — these merge
// child-over-parent and apply only to routes under /hk, never leaking the
// manifest/install-prompt affordance onto the rest of the app.
export const metadata: Metadata = {
  title: 'HK Tasks',
  manifest: '/manifest-hk.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HK Tasks',
  },
  icons: {
    apple: '/icons/hk/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a1329',
};

export default function HkLayout({ children }: { children: React.ReactNode }) {
  return <HkShell>{children}</HkShell>;
}
