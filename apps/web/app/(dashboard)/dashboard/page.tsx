'use client';

import { useEffect, useState } from 'react';
import { BedDouble, Building2, LogIn, LogOut, PercentCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';

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
  guest: { fullName: string };
}

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !hotelId) {
      setLoading(false);
      return;
    }
    Promise.all([
      apiFetch<Room[]>(`/rooms?hotelId=${hotelId}`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`),
    ])
      .then(([roomsData, confirmed, checkedIn]) => {
        setRooms(roomsData);
        setBookings([...confirmed.items, ...checkedIn.items]);
      })
      .finally(() => setLoading(false));
  }, [ready, hotelId]);

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
    { label: 'Occupancy today', value: `${occupancyPct}%`, icon: PercentCircle, tint: 'bg-brand-50 text-brand-700' },
    { label: 'Total rooms', value: rooms.length, icon: BedDouble, tint: 'bg-gold-50 text-gold-700' },
    { label: 'Arrivals today', value: arrivals.length, icon: LogIn, tint: 'bg-emerald-50 text-emerald-700' },
    { label: 'Departures today', value: departures.length, icon: LogOut, tint: 'bg-sky-50 text-sky-700' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Today's snapshot for this property." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="p-5">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${kpi.tint}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm text-slate-500">{kpi.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{kpi.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Arrivals today</h2>
          {arrivals.length === 0 ? (
            <p className="text-sm text-slate-400">No arrivals today.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {arrivals.map((b) => (
                <li key={b.id} className="py-2 text-sm text-slate-700">{b.guest.fullName}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Departures today</h2>
          {departures.length === 0 ? (
            <p className="text-sm text-slate-400">No departures today.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {departures.map((b) => (
                <li key={b.id} className="py-2 text-sm text-slate-700">{b.guest.fullName}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
