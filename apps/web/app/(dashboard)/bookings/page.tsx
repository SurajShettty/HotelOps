'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, LogIn, LogOut, Pencil, Plus, Search, X, XCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Pagination } from '@/components/ui/pagination';
import { GuestPicker, PickedGuest } from '@/components/ui/guest-picker';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CHECKED_IN', label: 'Checked in' },
  { value: 'CHECKED_OUT', label: 'Checked out' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
  { value: 'COMPLETED', label: 'Completed' },
];

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string } & GuestBadgeInfo;
  bookingRooms: { occupants: number; room: { id: string; roomNumber: string } }[];
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: { baseRate: string; baseOccupancy: number; maxOccupancy: number };
}

function BookingForm({
  hotelId,
  initial,
  onDone,
  onCancel,
}: {
  hotelId: string;
  initial?: Booking;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const originalRoomId = initial?.bookingRooms[0]?.room.id ?? null;
  const originalOccupants = initial?.bookingRooms[0]?.occupants ?? null;

  const [pickedGuest, setPickedGuest] = useState<PickedGuest | null>(null);
  const [checkIn, setCheckIn] = useState(initial?.checkInDate.slice(0, 10) ?? '');
  const [checkOut, setCheckOut] = useState(initial?.checkOutDate.slice(0, 10) ?? '');
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [occupants, setOccupants] = useState(originalOccupants ? String(originalOccupants) : '');
  const [occupantsTouched, setOccupantsTouched] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId) ?? null;
  const overCapacity = !!selectedRoom && Number(occupants) > selectedRoom.roomType.maxOccupancy;

  useEffect(() => {
    if (!hotelId || !checkIn || !checkOut) {
      setAvailableRooms([]);
      return;
    }
    setCheckingAvailability(true);
    const excludeParam = isEdit ? `&excludeBookingId=${initial!.id}` : '';
    apiFetch<{ availableRooms: AvailableRoom[] }>(
      `/rooms/availability?hotelId=${hotelId}&checkIn=${checkIn}&checkOut=${checkOut}${excludeParam}`,
    )
      .then((res) => {
        setAvailableRooms(res.availableRooms);
        setSelectedRoomId((prev) => {
          const next = prev && res.availableRooms.some((r) => r.id === prev)
            ? prev
            : originalRoomId && res.availableRooms.some((r) => r.id === originalRoomId)
              ? originalRoomId
              : (res.availableRooms[0]?.id ?? '');
          if (!occupantsTouched) {
            const room = res.availableRooms.find((r) => r.id === next);
            if (room) setOccupants(String(originalOccupants ?? room.roomType.baseOccupancy));
          }
          return next;
        });
      })
      .catch(() => setAvailableRooms([]))
      .finally(() => setCheckingAvailability(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, checkIn, checkOut]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const room = availableRooms.find((r) => r.id === selectedRoomId);
      if (!room) throw new ApiError('Select an available room', 400);
      const occupantCount = Number(occupants);
      if (!occupantCount || occupantCount < 1) throw new ApiError('Enter the number of occupants', 400);
      if (occupantCount > room.roomType.maxOccupancy) {
        throw new ApiError(`This room sleeps a maximum of ${room.roomType.maxOccupancy}`, 400);
      }

      if (isEdit) {
        const roomOrOccupantsChanged = selectedRoomId !== originalRoomId || occupantCount !== originalOccupants;
        await apiFetch(`/bookings/${initial!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            hotelId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            // Only resend the room (and its current rate) if the room or occupant
            // count actually changed, so we don't silently overwrite the guest's
            // originally agreed rate.
            ...(roomOrOccupantsChanged
              ? { rooms: [{ roomId: room.id, rate: Number(room.roomType.baseRate), occupants: occupantCount }] }
              : {}),
          }),
        });
      } else {
        if (!pickedGuest?.fullName.trim()) throw new ApiError('Enter a guest name', 400);
        if (!pickedGuest.id && (!pickedGuest.email.trim() || !pickedGuest.phone.trim())) {
          throw new ApiError('Enter the guest’s email and phone', 400);
        }

        // Reuse the existing guest record if one was picked from the search
        // results (search matches name, email, or phone, so this also covers
        // guests found by their email/phone); only create a new one when they
        // typed details that didn't match anybody, so repeat guests don't
        // fragment into duplicate profiles.
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
            rooms: [{ roomId: room.id, rate: Number(room.roomType.baseRate), occupants: occupantCount }],
            source: 'DIRECT',
          }),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? 'save' : 'create'} booking`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {!isEdit && <GuestPicker hotelId={hotelId} value={pickedGuest} onChange={setPickedGuest} />}
        {isEdit && (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Editing <span className="font-medium text-slate-900">{initial!.guest.fullName}</span>&apos;s booking
            <GuestBadges guest={initial!.guest} />
          </p>
        )}
        <div>
          <Label>Dates</Label>
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(nextCheckIn, nextCheckOut) => {
              setCheckIn(nextCheckIn);
              setCheckOut(nextCheckOut);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="room">Room</Label>
            <Select
              id="room"
              required
              value={selectedRoomId}
              onChange={(e) => {
                setSelectedRoomId(e.target.value);
                if (!occupantsTouched) {
                  const room = availableRooms.find((r) => r.id === e.target.value);
                  if (room) setOccupants(String(room.roomType.baseOccupancy));
                }
              }}
            >
              <option value="" disabled>
                {checkingAvailability ? 'Checking availability…' : 'Select an available room'}
              </option>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Room {r.roomNumber} — {r.roomType.baseRate}/night
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="occupants">Occupants</Label>
            <Input
              id="occupants"
              required
              type="number"
              min={1}
              value={occupants}
              onChange={(e) => {
                setOccupantsTouched(true);
                setOccupants(e.target.value);
              }}
            />
            {selectedRoom && (
              <p className={`mt-1 text-xs ${overCapacity ? 'text-rose-600' : 'text-slate-400'}`}>
                {overCapacity
                  ? `Exceeds this room's capacity of ${selectedRoom.roomType.maxOccupancy}`
                  : `Sleeps up to ${selectedRoom.roomType.maxOccupancy}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting || availableRooms.length === 0 || overCapacity}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Booking'}
          </Button>
          {isEdit && (
            <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-700">
              Cancel
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

export default function BookingsPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<'ARRIVING_TODAY' | 'DEPARTING_TODAY' | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function toggleQuickFilter(filter: 'ARRIVING_TODAY' | 'DEPARTING_TODAY') {
    const turningOn = quickFilter !== filter;
    setQuickFilter(turningOn ? filter : null);
    setStatus(turningOn ? (filter === 'ARRIVING_TODAY' ? 'CONFIRMED' : 'CHECKED_IN') : '');
    setPage(1);
  }

  // Debounce the free-text search so we're not hitting the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    const params = new URLSearchParams({ hotelId, page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (quickFilter === 'ARRIVING_TODAY') params.set('arrivingOn', today);
    if (quickFilter === 'DEPARTING_TODAY') params.set('departingOn', today);
    apiFetch<{ items: Booking[]; total: number }>(`/bookings?${params.toString()}`)
      .then((res) => {
        setBookings(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId, status, search, quickFilter, page]);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    setError(null);
    setCancellingId(id);
    try {
      await apiFetch(`/bookings/${id}/cancel`, { method: 'POST' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every reservation for this property."
        action={
          <Button
            onClick={() => {
              setEditingBooking(null);
              setShowCreateForm((v) => !v);
            }}
          >
            {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreateForm ? 'Cancel' : 'New Booking'}
          </Button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search guest name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setQuickFilter(null);
            setPage(1);
          }}
          className="w-44"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>

        <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" />

        <button
          type="button"
          onClick={() => toggleQuickFilter('ARRIVING_TODAY')}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            quickFilter === 'ARRIVING_TODAY'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <LogIn className="h-4 w-4" /> Check-in Today
        </button>
        <button
          type="button"
          onClick={() => toggleQuickFilter('DEPARTING_TODAY')}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            quickFilter === 'DEPARTING_TODAY'
              ? 'border-sky-300 bg-sky-50 text-sky-700'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <LogOut className="h-4 w-4" /> Check-out Today
        </button>
      </Card>

      {showCreateForm && (
        <BookingForm
          hotelId={hotelId}
          onDone={() => {
            setShowCreateForm(false);
            reload();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingBooking && (
        <BookingForm
          hotelId={hotelId}
          initial={editingBooking}
          onDone={() => {
            setEditingBooking(null);
            reload();
          }}
          onCancel={() => setEditingBooking(null)}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-8 w-8" />}
          title={status || search || quickFilter ? 'No bookings match these filters' : 'No bookings yet'}
          description={
            quickFilter === 'ARRIVING_TODAY'
              ? 'No guests are checking in today.'
              : quickFilter === 'DEPARTING_TODAY'
                ? 'No guests are checking out today.'
                : status || search
                  ? 'Try a different search or status.'
                  : 'Create your first booking to see it here.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Room(s)</th>
                <th className="px-5 py-3">Occupants</th>
                <th className="px-5 py-3">Check-in</th>
                <th className="px-5 py-3">Check-out</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => {
                const editable = b.status === 'CONFIRMED';
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <span className="flex items-center gap-1.5">
                        {b.guest.fullName}
                        <GuestBadges guest={b.guest} />
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}</td>
                    <td className="px-5 py-3 text-slate-600">{b.bookingRooms.map((br) => br.occupants).join(', ')}</td>
                    <td className="px-5 py-3 text-slate-600">{b.checkInDate.slice(0, 10)}</td>
                    <td className="px-5 py-3 text-slate-600">{b.checkOutDate.slice(0, 10)}</td>
                    <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-5 py-3">
                      {editable && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setShowCreateForm(false);
                              setEditingBooking(b);
                            }}
                            title="Edit booking"
                            className="text-slate-400 hover:text-brand-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleCancel(b.id)}
                            disabled={cancellingId === b.id}
                            title="Cancel booking"
                            className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
