'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Sparkles } from 'lucide-react';
import type { Serwist } from '@serwist/window';
import { clearSession, getToken, getUser, StoredUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { HotelProvider, useCurrentHotel } from '@/lib/hotel-context';
import { HOUSEKEEPING_AREA_ROLES } from '@/lib/roles';
import { RequireRole } from '@/components/ui/require-role';

declare global {
  interface Window {
    serwist?: Serwist;
  }
}

interface Hotel {
  id: string;
  name: string;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * The /hk service worker (public/hk/sw.js — see next.config.mjs and
 * apps/web/app/sw.ts) is only ever registered here, scoped to /hk — no other
 * route in the app calls this, so no other route ever gets an install
 * prompt or a controlling service worker. register:false in next.config.mjs
 * is what stops @serwist/next from auto-registering it everywhere instead.
 */
function useRegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || window.serwist === undefined) return;
    window.serwist.register();
  }, []);
}

/**
 * A deliberately minimal shell — no sidebar, no NAV_ITEMS, just a top bar —
 * unlike (dashboard)/layout.tsx's DashboardShell, which every other role
 * shares. Housekeeping staff only ever need this one screen on mobile.
 */
function HkTopBar({ user, hotels, hotelId, setHotelId, onLogout }: {
  user: StoredUser | null;
  hotels: Hotel[];
  hotelId: string | null;
  setHotelId: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-brand-950 px-4 py-3">
      <div className="flex items-center gap-2 text-white">
        <Sparkles className="h-5 w-5 text-gold-400" />
        <span className="text-[15px] font-semibold tracking-tight">Housekeeping</span>
      </div>

      {hotels.length > 1 && (
        <div className="relative min-w-0 flex-1 max-w-[9rem]">
          <select
            className="w-full appearance-none rounded-lg bg-white/[0.08] py-1.5 pl-2.5 pr-6 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-gold-400"
            value={hotelId ?? ''}
            onChange={(e) => setHotelId(e.target.value)}
          >
            {hotels.map((h) => (
              <option key={h.id} value={h.id} className="text-slate-900">{h.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-400" />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-brand-950">
          {user ? initials(user.fullName) : ''}
        </div>
        <button onClick={onLogout} title="Log out" className="text-brand-300 hover:text-white">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function HkAuthedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const { hotelId, setHotelId, ready } = useCurrentHotel();

  useRegisterServiceWorker();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    setCheckedAuth(true);
  }, [router]);

  useEffect(() => {
    if (!checkedAuth) return;
    apiFetch<Hotel[]>('/hotels')
      .then((data) => {
        setHotels(data);
        if (!hotelId && data.length > 0) setHotelId(data[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  if (!checkedAuth || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <HkTopBar user={user} hotels={hotels} hotelId={hotelId} setHotelId={setHotelId} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto p-3">
        <RequireRole allowed={HOUSEKEEPING_AREA_ROLES}>{children}</RequireRole>
      </main>
    </div>
  );
}

export function HkShell({ children }: { children: React.ReactNode }) {
  return (
    <HotelProvider>
      <HkAuthedShell>{children}</HkAuthedShell>
    </HotelProvider>
  );
}
