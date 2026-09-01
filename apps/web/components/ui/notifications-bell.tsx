'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarCheck, CalendarClock, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';

const POLL_INTERVAL_MS = 60_000;

type NotificationType = 'CHECK_IN' | 'CHECK_OUT' | 'BOOKING_CONFIRMATION' | 'MAINTENANCE';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  dueToday: boolean;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
}

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  CHECK_IN: CalendarClock,
  CHECK_OUT: CalendarClock,
  BOOKING_CONFIRMATION: CalendarCheck,
  MAINTENANCE: Wrench,
};

function relativeTime(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) < 1) return 'now';
  if (diffHours > 0) return diffHours < 24 ? `in ${diffHours}h` : `in ${Math.round(diffHours / 24)}d`;
  return Math.abs(diffHours) < 24 ? `${Math.abs(diffHours)}h ago` : `${Math.round(Math.abs(diffHours) / 24)}d ago`;
}

export function NotificationsBell() {
  const { hotelId } = useCurrentHotel();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hotelId) return;
    let cancelled = false;

    function load() {
      apiFetch<NotificationsResponse>(`/notifications?hotelId=${hotelId}`)
        .then((data) => {
          if (!cancelled) setItems(data.items);
        })
        .catch(() => undefined);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hotelId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-brand-200 hover:bg-white/5 hover:text-white"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-brand-950">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Nothing to show right now.</p>
            ) : (
              items.map((item) => {
                const Icon = TYPE_ICON[item.type];
                return (
                  <div key={item.id} className="flex items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 last:border-0">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">{item.message}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(item.timestamp)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
