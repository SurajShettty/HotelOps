'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, Bell, CalendarCheck, CalendarClock, Check, Hourglass, Sunrise, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';

const POLL_INTERVAL_MS = 60_000;

// Notifications are computed live from bookings/room blocks (see
// NotificationsService) rather than stored rows, so there's no server-side
// place to persist read/cleared state — it's kept per-browser instead. Ids
// are stable (`checkin-<bookingId>`, etc.), so this survives across polls.
const READ_KEY = 'hotelops_notifications_read';
const CLEARED_KEY = 'hotelops_notifications_cleared';

function loadIdSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

type NotificationType =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'BOOKING_CONFIRMATION'
  | 'MAINTENANCE'
  | 'DAILY_BRIEFING'
  | 'ROOM_BLOCKED_TOO_LONG'
  | 'ROOM_UNBOOKED_TOO_LONG';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  dueToday: boolean;
  /** Only set for DAILY_BRIEFING — rendered as a KPI grid instead of `message`. */
  stats?: { label: string; value: string }[];
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
  DAILY_BRIEFING: Sunrise,
  ROOM_BLOCKED_TOO_LONG: Ban,
  ROOM_UNBOOKED_TOO_LONG: Hourglass,
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
  const [readIds, setReadIds] = useState<Set<string>>(() => loadIdSet(READ_KEY));
  const [clearedIds, setClearedIds] = useState<Set<string>>(() => loadIdSet(CLEARED_KEY));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hotelId) return;
    let cancelled = false;

    function load() {
      apiFetch<NotificationsResponse>(`/notifications?hotelId=${hotelId}`)
        .then((data) => {
          if (cancelled) return;
          setItems(data.items);
          // Garbage-collect stored ids for notifications that no longer exist
          // (e.g. the guest already checked in) so storage doesn't grow forever.
          const liveIds = new Set(data.items.map((i) => i.id));
          setReadIds((prev) => {
            const next = new Set([...prev].filter((id) => liveIds.has(id)));
            saveIdSet(READ_KEY, next);
            return next;
          });
          setClearedIds((prev) => {
            const next = new Set([...prev].filter((id) => liveIds.has(id)));
            saveIdSet(CLEARED_KEY, next);
            return next;
          });
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

  const visibleItems = items.filter((i) => !clearedIds.has(i.id));
  const unreadCount = visibleItems.filter((i) => !readIds.has(i.id)).length;

  function markAsRead(id: string) {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      saveIdSet(READ_KEY, next);
      return next;
    });
  }

  function clearAll() {
    setClearedIds((prev) => {
      const next = new Set(prev);
      for (const item of visibleItems) next.add(item.id);
      saveIdSet(CLEARED_KEY, next);
      return next;
    });
  }

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
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-brand-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-96 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Notifications</span>
            {visibleItems.length > 0 && (
              <button onClick={clearAll} className="text-xs font-medium text-brand-700 hover:text-brand-900">
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visibleItems.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Nothing to show right now.</p>
            ) : (
              visibleItems.map((item) => {
                const Icon = TYPE_ICON[item.type];
                const isUnread = !readIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    disabled={!isUnread}
                    title={isUnread ? 'Mark as read' : undefined}
                    className="group flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Icon className="h-3.5 w-3.5" />
                      {isUnread && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold-400 ring-2 ring-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${isUnread ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{item.title}</p>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
                          {relativeTime(item.timestamp)}
                          {isUnread && <Check className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                        </span>
                      </div>
                      {item.stats ? (
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                          {item.stats.map((s) => (
                            <div key={s.label} className="flex items-baseline justify-between gap-2">
                              <dt className="truncate text-[11px] text-slate-400">{s.label}</dt>
                              <dd className="text-xs font-semibold text-slate-700">{s.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="truncate text-xs text-slate-400">{item.message}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
