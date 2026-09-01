'use client';

import { useEffect, useMemo, useState } from 'react';
import { BedDouble, CheckCircle2, Search } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { GuestPicker, PickedGuest } from '@/components/ui/guest-picker';

interface RoomType {
  id: string;
  name: string;
  baseRate: string;
  baseOccupancy: number;
  maxOccupancy: number;
}

interface Room {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomType: RoomType;
}

interface RateQuote {
  baseRate: number;
  averageRate: number;
  blended: boolean;
}

function addDaysIso(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function BookRoomModal({
  hotelId,
  room,
  checkIn,
  checkOut,
  nights,
  onCancel,
  onDone,
}: {
  hotelId: string;
  room: Room;
  checkIn: string;
  checkOut: string;
  nights: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [pickedGuest, setPickedGuest] = useState<PickedGuest | null>(null);
  const [occupants, setOccupants] = useState(String(room.roomType.baseOccupancy));
  const [rate, setRate] = useState(String(Number(room.roomType.baseRate)));
  const [rateTouched, setRateTouched] = useState(false);
  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [rateQuoteLoading, setRateQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const overCapacity = Number(occupants) > room.roomType.maxOccupancy;

  useEffect(() => {
    setRateQuoteLoading(true);
    const timer = setTimeout(() => {
      apiFetch<RateQuote>(`/pricing-rules/quote-range?hotelId=${hotelId}&roomTypeId=${room.roomType.id}&checkIn=${checkIn}&checkOut=${checkOut}`)
        .then((res) => {
          setRateQuote(res);
          if (!rateTouched) setRate(String(res.averageRate));
        })
        .catch(() => setRateQuote(null))
        .finally(() => setRateQuoteLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, room.roomType.id, checkIn, checkOut]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickedGuest?.fullName.trim()) {
      setError('Enter a guest name');
      return;
    }
    if (!pickedGuest.id && (!pickedGuest.email.trim() || !pickedGuest.phone.trim())) {
      setError('Enter the guest’s email and phone');
      return;
    }
    if (overCapacity) {
      setError(`This room sleeps a maximum of ${room.roomType.maxOccupancy}`);
      return;
    }
    setSubmitting(true);
    try {
      const guestId =
        pickedGuest.id ??
        (
          await apiFetch<{ id: string }>('/guests', {
            method: 'POST',
            body: JSON.stringify({
              hotelId,
              fullName: pickedGuest.fullName.trim(),
              email: pickedGuest.email.trim(),
              phone: pickedGuest.phone.trim(),
            }),
          })
        ).id;

      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          hotelId,
          guestId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          rooms: [{ roomId: room.id, rate: Number(rate), occupants: Number(occupants) }],
          source: 'DIRECT',
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <p className="text-sm font-medium text-slate-900">
            Book Room {room.roomNumber} <span className="font-normal text-slate-500">· {room.roomType.name}</span>
          </p>
          <p className="text-xs text-slate-500">
            {checkIn} → {checkOut} · {nights} night{nights === 1 ? '' : 's'}
          </p>

          <GuestPicker hotelId={hotelId} value={pickedGuest} onChange={setPickedGuest} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="modal-occupants">Occupants</Label>
              <Input
                id="modal-occupants"
                type="number"
                min={1}
                required
                value={occupants}
                onChange={(e) => setOccupants(e.target.value)}
              />
              {overCapacity && <p className="mt-1 text-xs text-rose-600">Sleeps a maximum of {room.roomType.maxOccupancy}</p>}
            </div>
            <div>
              <Label htmlFor="modal-rate">Rate/night</Label>
              <Input
                id="modal-rate"
                type="number"
                min={0}
                step="any"
                required
                value={rate}
                onChange={(e) => {
                  setRateTouched(true);
                  setRate(e.target.value);
                }}
              />
              {rateQuoteLoading ? (
                <p className="mt-1 text-xs text-slate-400">Checking pricing rules…</p>
              ) : rateQuote && (rateQuote.averageRate !== rateQuote.baseRate || rateQuote.blended) ? (
                <p className="mt-1 text-xs text-slate-400">
                  Suggests {rateQuote.averageRate}
                  {rateQuote.blended ? ' (varies by night)' : ''}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || overCapacity}>
              {submitting ? 'Creating…' : 'Create Booking'}
            </Button>
            <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </form>
      </Card>
      </div>
    </div>
  );
}

export default function AvailabilityPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [roomTypeId, setRoomTypeId] = useState('');
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDaysIso(todayIso(), 1));
  const [availableRooms, setAvailableRooms] = useState<Room[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<RoomType[]>(`/room-types?hotelId=${hotelId}`).then(setRoomTypes).catch(() => setRoomTypes([]));
    apiFetch<Room[]>(`/rooms?hotelId=${hotelId}`).then(setAllRooms).catch(() => setAllRooms([]));
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId || !checkIn || !checkOut) {
      setAvailableRooms(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      const typeParam = roomTypeId ? `&roomTypeId=${roomTypeId}` : '';
      apiFetch<{ availableRooms: Room[] }>(`/rooms/availability?hotelId=${hotelId}&checkIn=${checkIn}&checkOut=${checkOut}${typeParam}`)
        .then((res) => setAvailableRooms(res.availableRooms))
        .catch(() => setAvailableRooms(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [hotelId, checkIn, checkOut, roomTypeId, refreshKey]);

  const groups = useMemo(() => {
    const relevantTypes = roomTypeId ? roomTypes.filter((t) => t.id === roomTypeId) : roomTypes;
    return relevantTypes.map((type) => {
      const totalOfType = allRooms.filter((r) => r.roomType.id === type.id).length;
      const availableOfType = (availableRooms ?? []).filter((r) => r.roomType.id === type.id);
      return { type, totalOfType, availableOfType };
    });
  }, [roomTypes, allRooms, availableRooms, roomTypeId]);

  const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Availability" subtitle="Check what's free for a given date range — for phone and walk-in inquiries." />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Dates</Label>
            <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={(ci, co) => { setCheckIn(ci); setCheckOut(co); }} />
          </div>
          <div>
            <Label htmlFor="availability-room-type">Room type</Label>
            <Select id="availability-room-type" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
              <option value="">All room types</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-400">Checking…</p>
      ) : !availableRooms ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="Pick dates to check availability" />
      ) : groups.every((g) => g.availableOfType.length === 0) ? (
        <EmptyState icon={<BedDouble className="h-8 w-8" />} title="Nothing available" description={`No rooms are free for ${checkIn} → ${checkOut}.`} />
      ) : (
        <div className="space-y-3">
          {groups.map(({ type, totalOfType, availableOfType }) => (
            <Card key={type.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <BedDouble className="h-4 w-4 text-slate-400" />
                    {type.name}
                  </div>
                  <p className="text-xs text-slate-500">
                    Up to {type.maxOccupancy} guests · {type.baseRate}/night · {nights} night{nights === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    availableOfType.length > 0
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-rose-50 text-rose-700 ring-rose-200'
                  }`}
                >
                  {availableOfType.length} of {totalOfType} available
                </span>
              </div>
              {availableOfType.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableOfType.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setBookingRoom(r)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Room {r.roomNumber}
                      {r.floor ? ` · Floor ${r.floor}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {bookingRoom && (
        <BookRoomModal
          hotelId={hotelId}
          room={bookingRoom}
          checkIn={checkIn}
          checkOut={checkOut}
          nights={nights}
          onCancel={() => setBookingRoom(null)}
          onDone={() => {
            setBookingRoom(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
