'use client';

import { useEffect, useState } from 'react';
import { DoorOpen, LogIn, Search } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { formatTime12h, localTimeHHmm, todayInTimeZone } from '@/lib/format';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';
import { RequireRole } from '@/components/ui/require-role';
import { RECEPTIONIST_AREA_ROLES } from '@/lib/roles';

interface BookingRoom {
  id: string;
  room: { id: string; roomNumber: string; status: string; roomTypeId: string };
}

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string } & GuestBadgeInfo;
  bookingRooms: BookingRoom[];
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  status: string;
  roomType: { id: string; name: string; baseRate: string };
}

export default function CheckinPage() {
  const { hotelId, ready, timezone } = useCurrentHotel();
  const [arrivals, setArrivals] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<Record<string, string>>({});
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [hotelPolicy, setHotelPolicy] = useState<{ timezone: string; checkInTime: string; earlyCheckInFee: string } | null>(null);
  const [waiveEarlyFee, setWaiveEarlyFee] = useState<Record<string, boolean>>({});
  // Alternate rooms offered when a guest's reserved room isn't ready yet
  // (typically an early arrival — the previous guest hasn't checked out or
  // housekeeping hasn't finished) so front desk can seat them elsewhere
  // rather than making them wait. Keyed by booking id.
  const [altRooms, setAltRooms] = useState<Record<string, AvailableRoom[]>>({});
  const [selectedAltRoom, setSelectedAltRoom] = useState<Record<string, string>>({});
  // Base rate per room type, so alternate-room options can be labeled
  // Upgrade/Downgrade relative to what was actually booked.
  const [roomTypeRates, setRoomTypeRates] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ id: string; baseRate: string }[]>(`/room-types?hotelId=${hotelId}`)
      .then((types) => setRoomTypeRates(Object.fromEntries(types.map((t) => [t.id, Number(t.baseRate)]))))
      .catch(() => setRoomTypeRates({}));
  }, [hotelId]);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`)
      .then((res) => setArrivals([...res.items].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  // Only offered for single-room bookings — same scope limit as the "move
  // rooms" flows on the Check-Out and Extend Stay pages.
  useEffect(() => {
    if (!hotelId) return;
    const today = todayInTimeZone(timezone);
    for (const b of arrivals) {
      if (b.bookingRooms.length !== 1) continue;
      const room = b.bookingRooms[0].room;
      if (room.status === 'AVAILABLE') continue;
      if (altRooms[b.id]) continue;
      apiFetch<{ availableRooms: AvailableRoom[] }>(
        `/rooms/availability?hotelId=${hotelId}&checkIn=${today}&checkOut=${b.checkOutDate.slice(0, 10)}&excludeBookingId=${b.id}`,
      )
        .then((res) => {
          setAltRooms((prev) => ({ ...prev, [b.id]: res.availableRooms.filter((r) => r.status === 'AVAILABLE' && r.id !== room.id) }));
        })
        .catch(() => setAltRooms((prev) => ({ ...prev, [b.id]: [] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, arrivals]);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ timezone: string; checkInTime: string; earlyCheckInFee: string }>(`/hotels/${hotelId}`)
      .then((h) => setHotelPolicy({ timezone: h.timezone, checkInTime: h.checkInTime, earlyCheckInFee: h.earlyCheckInFee }))
      .catch(() => setHotelPolicy(null));
  }, [hotelId]);

  // Client-side estimate only, for the fee hint below — the server checks
  // its own clock against the hotel's policy time when check-in is submitted.
  const isEarlyNow = !!hotelPolicy && localTimeHHmm(new Date(), hotelPolicy.timezone) < hotelPolicy.checkInTime;
  const earlyFeeAmount = hotelPolicy ? Number(hotelPolicy.earlyCheckInFee) : 0;

  async function handleCheckin(booking: Booking) {
    setError(null);
    setCheckingInId(booking.id);
    try {
      const depositRaw = deposits[booking.id];
      const altRoomId = selectedAltRoom[booking.id];
      await apiFetch(`/checkin?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          roomAssignments: booking.bookingRooms.map((br) => ({ bookingRoomId: br.id, roomId: altRoomId ?? br.room.id })),
          ...(depositRaw ? { depositAmount: Number(depositRaw) } : {}),
          waiveEarlyCheckInFee: !!waiveEarlyFee[booking.id],
        }),
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setCheckingInId(null);
    }
  }

  const visibleArrivals = guestSearch.trim()
    ? arrivals.filter((b) => b.guest.fullName.toLowerCase().includes(guestSearch.trim().toLowerCase()))
    : arrivals;

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <RequireRole allowed={RECEPTIONIST_AREA_ROLES}>
    <div>
      <PageHeader
        title="Check-In"
        subtitle={`Confirmed bookings waiting to arrive.${hotelPolicy ? ` Standard check-in from ${formatTime12h(hotelPolicy.checkInTime)}.` : ''}`}
      />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {arrivals.length > 0 && (
        <Card className="mb-4 p-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search guest name…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : arrivals.length === 0 ? (
        <EmptyState icon={<LogIn className="h-8 w-8" />} title="No arrivals waiting" description="Confirmed bookings will show up here, ready to check in." />
      ) : visibleArrivals.length === 0 ? (
        <EmptyState icon={<LogIn className="h-8 w-8" />} title="No matching guest" description="Try a different name." />
      ) : (
        <div className="space-y-3">
          {visibleArrivals.map((b) => {
            const isSingleRoom = b.bookingRooms.length === 1;
            const notReady = b.bookingRooms.some((br) => br.room.status !== 'AVAILABLE');
            const canOfferAlt = notReady && isSingleRoom;
            const altOptions = altRooms[b.id];
            const altPicked = selectedAltRoom[b.id];
            const canCheckIn = !notReady || (canOfferAlt && !!altPicked);
            return (
              <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-slate-900">
                    {b.guest.fullName}
                    <GuestBadges guest={b.guest} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{b.checkInDate.slice(0, 10)} → {b.checkOutDate.slice(0, 10)}</span>
                    <span>·</span>
                    <span>Room {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}</span>
                    {b.bookingRooms.map((br) => (
                      <StatusBadge key={br.id} status={br.room.status} />
                    ))}
                  </div>
                  {isEarlyNow && earlyFeeAmount > 0 && (
                    <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                      <input
                        type="checkbox"
                        checked={!!waiveEarlyFee[b.id]}
                        onChange={(e) => setWaiveEarlyFee((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {waiveEarlyFee[b.id]
                        ? `Early check-in fee of ${earlyFeeAmount} waived`
                        : `Early check-in — waive the ${earlyFeeAmount} fee?`}
                    </label>
                  )}
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
                    disabled={checkingInId === b.id || !canCheckIn}
                    title={!canCheckIn ? (canOfferAlt ? 'Pick a room to check into' : 'Room is not marked available') : undefined}
                  >
                    {checkingInId === b.id ? 'Checking in…' : altPicked ? `Check In → Room ${altOptions?.find((r) => r.id === altPicked)?.roomNumber}` : 'Check In'}
                  </Button>
                </div>
                {canOfferAlt && (
                  <div className="w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      Room {b.bookingRooms[0].room.roomNumber} isn't ready yet — check in to another room instead:
                    </p>
                    {altOptions === undefined ? (
                      <p className="text-xs text-amber-700">Checking other rooms…</p>
                    ) : altOptions.length === 0 ? (
                      <p className="text-xs text-amber-700">No other rooms are free right now — wait for this room to be ready.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {altOptions.map((r) => {
                          const selected = altPicked === r.id;
                          const originalRate = roomTypeRates[b.bookingRooms[0].room.roomTypeId];
                          const altRate = Number(r.roomType.baseRate);
                          const tier =
                            originalRate === undefined || altRate === originalRate
                              ? null
                              : altRate > originalRate
                                ? 'upgrade'
                                : 'downgrade';
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedAltRoom((prev) => ({ ...prev, [b.id]: r.id }))}
                              className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
                                selected
                                  ? 'border-brand-600 bg-brand-50 ring-1 ring-inset ring-brand-600'
                                  : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                              }`}
                            >
                              <DoorOpen className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-brand-700' : 'text-slate-400'}`} />
                              <span className="min-w-0">
                                <span className={`block truncate text-sm font-medium ${selected ? 'text-brand-900' : 'text-slate-900'}`}>
                                  Room {r.roomNumber}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <span className="truncate">{r.roomType.name}</span>
                                  {tier && (
                                    <span
                                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        tier === 'upgrade' ? 'bg-gold-50 text-gold-700' : 'bg-slate-200 text-slate-600'
                                      }`}
                                    >
                                      {tier === 'upgrade' ? 'Upgrade' : 'Downgrade'}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </RequireRole>
  );
}
