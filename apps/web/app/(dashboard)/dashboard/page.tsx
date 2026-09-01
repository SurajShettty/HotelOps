'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  DoorClosed,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  PercentCircle,
  UserX,
  Wallet,
  Wrench,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { formatTime12h } from '@/lib/format';
import { Button, Card, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';
import { DashboardTrends } from '@/components/ui/dashboard-trends';
import { OccupancyHeatmap } from '@/components/ui/occupancy-heatmap';

interface Room {
  id: string;
  roomNumber: string;
  status: string;
}

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string } & GuestBadgeInfo;
  bookingRooms: { room: { roomNumber: string } }[];
}

interface DashboardSummary {
  revenue: { today: number; monthToDate: number };
  today: { arrivals: number; departures: number };
  alerts: {
    roomsNotReadyForArrivals: { bookingId: string; guestName: string; roomNumber: string; roomStatus: string }[];
    overdueHousekeeping: { taskId: string; roomNumber: string; status: string; minutesOpen: number }[];
    roomsOutOfService: { roomId: string; roomNumber: string; reason: string }[];
    noShows: { bookingId: string; guestName: string; roomNumbers: string[]; checkInDate: string }[];
    overstays: { bookingId: string; guestName: string; roomNumbers: string[]; checkOutDate: string; checkOutTime: string; dueToday: boolean }[];
  };
}

function daysAgo(iso: string) {
  const ms = new Date(new Date().toDateString()).getTime() - new Date(iso.slice(0, 10)).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const REVENUE_VISIBLE_KEY = 'hotelops_dashboard_revenue_visible';

function CreateHotelForm() {
  const { setHotelId } = useCurrentHotel();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const hotel = await apiFetch<{ id: string }>('/hotels', { method: 'POST', body: JSON.stringify({ name }) });
      setHotelId(hotel.id);
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create hotel');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Create your first hotel</h2>
        <p className="mt-1 text-sm text-slate-500">You need at least one property before anything else works.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div>
            <Label htmlFor="hotel-name">Hotel name</Label>
            <Input id="hotel-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunset Grand" />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating…' : 'Create hotel'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueVisible, setRevenueVisible] = useState(false);

  // Hidden by default (e.g. a front-desk screen visible to walk-ins) — remembered
  // per browser once toggled, so staff who do want it visible aren't re-hiding it every load.
  useEffect(() => {
    setRevenueVisible(localStorage.getItem(REVENUE_VISIBLE_KEY) === 'true');
  }, []);

  function toggleRevenueVisible() {
    setRevenueVisible((v) => {
      const next = !v;
      localStorage.setItem(REVENUE_VISIBLE_KEY, String(next));
      return next;
    });
  }

  function reload() {
    if (!hotelId) return;
    Promise.all([
      apiFetch<Room[]>(`/rooms?hotelId=${hotelId}`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`),
      apiFetch<DashboardSummary>(`/dashboard/summary?hotelId=${hotelId}`),
    ])
      .then(([roomsData, confirmed, checkedIn, summaryData]) => {
        setRooms(roomsData);
        setBookings([...confirmed.items, ...checkedIn.items]);
        setSummary(summaryData);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!ready || !hotelId) {
      setLoading(false);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  async function handleMarkNoShow(bookingId: string) {
    if (!confirm('Mark this booking as a no-show?')) return;
    try {
      await apiFetch(`/bookings/${bookingId}/no-show`, { method: 'POST' });
      reload();
    } catch {
      // Non-fatal — the alert list below still reflects the server's true state on next reload.
    }
  }

  if (!ready || loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (!hotelId) {
    return <CreateHotelForm />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const arrivals = bookings.filter((b) => b.checkInDate.slice(0, 10) === today && b.status === 'CONFIRMED');
  const departures = bookings.filter((b) => b.checkOutDate.slice(0, 10) === today && b.status === 'CHECKED_IN');
  const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
  const occupancyPct = rooms.length > 0 ? Math.round((occupied / rooms.length) * 100) : 0;

  const kpis = [
    { key: 'occupancy', label: 'Occupancy today', value: `${occupancyPct}%`, icon: PercentCircle, tint: 'bg-brand-50 text-brand-700' },
    { key: 'revenueToday', label: 'Revenue today', value: summary ? money(summary.revenue.today) : '—', icon: Wallet, tint: 'bg-gold-50 text-gold-700', sensitive: true },
    { key: 'revenueMtd', label: 'Revenue MTD', value: summary ? money(summary.revenue.monthToDate) : '—', icon: Wallet, tint: 'bg-gold-50 text-gold-700', sensitive: true },
    { key: 'totalRooms', label: 'Total rooms', value: rooms.length, icon: BedDouble, tint: 'bg-violet-50 text-violet-700' },
    { key: 'arrivals', label: 'Arrivals today', value: summary ? summary.today.arrivals : '—', icon: LogIn, tint: 'bg-emerald-50 text-emerald-700' },
    { key: 'departures', label: 'Departures today', value: summary ? summary.today.departures : '—', icon: LogOut, tint: 'bg-sky-50 text-sky-700' },
  ];

  const alerts = summary?.alerts;
  const alertCount = alerts
    ? alerts.roomsNotReadyForArrivals.length +
      alerts.overdueHousekeeping.length +
      alerts.roomsOutOfService.length +
      alerts.noShows.length +
      alerts.overstays.length
    : 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Today's snapshot for this property." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const masked = kpi.sensitive && !revenueVisible;
          return (
            <Card key={kpi.key} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
                {kpi.sensitive && (
                  <button
                    type="button"
                    onClick={toggleRevenueVisible}
                    title={masked ? 'Show revenue' : 'Hide revenue'}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <div className="text-sm text-slate-500">{kpi.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {masked ? '••••••' : kpi.value}
              </div>
            </Card>
          );
        })}
      </div>

      {alerts && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${alertCount > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {alertCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Alerts</h2>
              <p className="text-xs text-slate-500">{alertCount > 0 ? `${alertCount} item${alertCount === 1 ? '' : 's'} need attention` : 'Nothing needs attention right now'}</p>
            </div>
          </div>

          {alertCount > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {alerts.roomsNotReadyForArrivals.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <DoorClosed className="h-3.5 w-3.5" /> Room not ready for arrival
                  </h3>
                  <ul className="space-y-1.5">
                    {alerts.roomsNotReadyForArrivals.map((a) => (
                      <li key={a.bookingId} className="text-sm text-slate-700">
                        Room {a.roomNumber} — {a.guestName} <span className="text-slate-400">({a.roomStatus.toLowerCase()})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {alerts.overdueHousekeeping.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Clock className="h-3.5 w-3.5" /> Overdue housekeeping
                  </h3>
                  <ul className="space-y-1.5">
                    {alerts.overdueHousekeeping.map((t) => (
                      <li key={t.taskId} className="text-sm text-slate-700">
                        Room {t.roomNumber} — {t.status.toLowerCase().replace('_', ' ')}{' '}
                        <span className="text-slate-400">({t.minutesOpen} min)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {alerts.roomsOutOfService.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Wrench className="h-3.5 w-3.5" /> Rooms out of service
                  </h3>
                  <ul className="space-y-1.5">
                    {alerts.roomsOutOfService.map((r) => (
                      <li key={r.roomId} className="text-sm text-slate-700">
                        Room {r.roomNumber} <span className="text-slate-400">({r.reason.toLowerCase().replace('_', ' ')})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {alerts.noShows.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <UserX className="h-3.5 w-3.5" /> No-shows
                  </h3>
                  <ul className="space-y-1.5">
                    {alerts.noShows.map((n) => (
                      <li key={n.bookingId} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span>
                          {n.guestName} <span className="text-slate-400">— Room {n.roomNumbers.join(', ')} ({daysAgo(n.checkInDate)}d overdue)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMarkNoShow(n.bookingId)}
                          className="shrink-0 text-xs font-medium text-rose-600 hover:underline"
                        >
                          Mark no-show
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {alerts.overstays.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Clock className="h-3.5 w-3.5" /> Overstays
                  </h3>
                  <ul className="space-y-1.5">
                    {alerts.overstays.map((o) => (
                      <li key={o.bookingId} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span>
                          {o.guestName}{' '}
                          <span className="text-slate-400">
                            — Room {o.roomNumbers.join(', ')} (
                            {o.dueToday ? `due out today, past ${formatTime12h(o.checkOutTime)}` : `${daysAgo(o.checkOutDate)}d overdue`})
                          </span>
                        </span>
                        <Link href="/checkout" className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
                          Check out
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <DashboardTrends hotelId={hotelId} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <OccupancyHeatmap hotelId={hotelId} />
        <div className="grid gap-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Waiting to check in</h2>
              {arrivals.length > 0 && (
                <Link href="/checkin" className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                  Go to Check-In <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            {arrivals.length === 0 ? (
              <p className="text-sm text-slate-400">Nobody waiting to check in.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {arrivals.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      {b.guest.fullName}
                      <GuestBadges guest={b.guest} />
                      <span className="text-slate-400">
                        · Room {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}
                      </span>
                    </span>
                    <Link href="/checkin" className="shrink-0 text-slate-400 hover:text-brand-700" title="Check in">
                      <LogIn className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Waiting to check out</h2>
              {departures.length > 0 && (
                <Link href="/checkout" className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                  Go to Check-Out <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            {departures.length === 0 ? (
              <p className="text-sm text-slate-400">Nobody waiting to check out.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {departures.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      {b.guest.fullName}
                      <GuestBadges guest={b.guest} />
                      <span className="text-slate-400">
                        · Room {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}
                      </span>
                    </span>
                    <Link href="/checkout" className="shrink-0 text-slate-400 hover:text-brand-700" title="Check out">
                      <LogOut className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
