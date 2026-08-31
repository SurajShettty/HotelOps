'use client';

import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';

interface BookingRoom {
  id: string;
  room: { id: string; roomNumber: string; status: string };
}

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string };
  bookingRooms: BookingRoom[];
}

export default function CheckinPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [arrivals, setArrivals] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<Record<string, string>>({});
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`)
      .then((res) => setArrivals(res.items))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  async function handleCheckin(booking: Booking) {
    setError(null);
    setCheckingInId(booking.id);
    try {
      const depositRaw = deposits[booking.id];
      await apiFetch('/checkin', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          roomAssignments: booking.bookingRooms.map((br) => ({ bookingRoomId: br.id, roomId: br.room.id })),
          ...(depositRaw ? { depositAmount: Number(depositRaw) } : {}),
        }),
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setCheckingInId(null);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Check-In" subtitle="Confirmed bookings waiting to arrive." />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : arrivals.length === 0 ? (
        <EmptyState icon={<LogIn className="h-8 w-8" />} title="No arrivals waiting" description="Confirmed bookings will show up here, ready to check in." />
      ) : (
        <div className="space-y-3">
          {arrivals.map((b) => {
            const notReady = b.bookingRooms.some((br) => br.room.status !== 'AVAILABLE');
            return (
              <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="font-medium text-slate-900">{b.guest.fullName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{b.checkInDate.slice(0, 10)} → {b.checkOutDate.slice(0, 10)}</span>
                    <span>·</span>
                    <span>Room {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}</span>
                    {b.bookingRooms.map((br) => (
                      <StatusBadge key={br.id} status={br.room.status} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <Label htmlFor={`deposit-${b.id}`}>Deposit</Label>
                    <Input
                      id={`deposit-${b.id}`}
                      type="number"
                      placeholder="0"
                      value={deposits[b.id] ?? ''}
                      onChange={(e) => setDeposits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    onClick={() => handleCheckin(b)}
                    disabled={checkingInId === b.id || notReady}
                    title={notReady ? 'Room is not marked available' : undefined}
                  >
                    {checkingInId === b.id ? 'Checking in…' : 'Check In'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
