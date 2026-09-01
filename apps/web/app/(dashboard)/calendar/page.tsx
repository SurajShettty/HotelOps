'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CalendarPlus, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';
import { GuestPicker, PickedGuest } from '@/components/ui/guest-picker';

const DAYS_SHOWN = 14;

interface RoomType {
  id: string;
  name: string;
  baseRate: string;
  maxOccupancy: number;
}

interface Room {
  id: string;
  roomNumber: string;
  roomType: RoomType;
}

interface RateQuote {
  baseRate: number;
  averageRate: number;
  blended: boolean;
}

interface Booking {
  id: string;
  status: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string; email: string | null; phone: string | null } & GuestBadgeInfo;
  bookingRooms: { occupants: number; room: { id: string; roomNumber: string } }[];
}

interface RoomBlock {
  id: string;
  roomId: string;
  reason: string;
  startDate: string;
  endDate: string;
  notes: string | null;
}

interface Anchor {
  top: number;
  left: number;
}

interface CellInfo {
  kind: 'booking' | 'block';
  id: string;
  label: string;
  status: string;
}

// Local calendar date, not UTC — `d` here is always a local midnight (see
// addDays/startDate below), and toISOString() would convert that to UTC,
// silently rolling it back a day for any viewer ahead of UTC (including the
// app's Asia/Kolkata default) and misaligning every column from its header.
function toDateOnly(d: Date) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Cycled per distinct room type (sorted by name) so the same type always gets the same color for a given hotel's type list.
const ROOM_TYPE_COLORS = [
  'bg-violet-400',
  'bg-cyan-400',
  'bg-rose-400',
  'bg-lime-500',
  'bg-orange-400',
  'bg-fuchsia-400',
  'bg-teal-400',
  'bg-indigo-400',
];

function useRoomTypeColors(rooms: Room[]) {
  return useMemo(() => {
    const types = Array.from(new Map(rooms.map((r) => [r.roomType.id, r.roomType.name])).entries())
      .sort((a, b) => a[1].localeCompare(b[1]));
    const colors = new Map<string, string>();
    types.forEach(([id], i) => colors.set(id, ROOM_TYPE_COLORS[i % ROOM_TYPE_COLORS.length]));
    return { colors, types };
  }, [rooms]);
}

function BlockForm({
  hotelId,
  roomId,
  date,
  anchor,
  onDone,
  onCancel,
}: {
  hotelId: string;
  roomId: string;
  date: string;
  anchor: Anchor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('MAINTENANCE');
  const [endDate, setEndDate] = useState(toDateOnly(addDays(new Date(date), 1)));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/rooms/block', {
        method: 'POST',
        body: JSON.stringify({ hotelId, roomId, reason, startDate: date, endDate }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to block room');
      setSubmitting(false);
    }
  }

  // Rendered in a portal (not inside the table's overflow-x-auto container) and
  // positioned with fixed coordinates from the clicked cell's bounding rect, so
  // it can never get clipped by the table's scroll box, however far down/right
  // the cell is.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <form
        onSubmit={handleSubmit}
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-xs font-medium text-slate-500">Block from {date}</p>
        <div>
          <Label htmlFor="block-reason">Reason</Label>
          <Select id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="RENOVATION">Renovation</option>
            <option value="VIP">VIP</option>
            <option value="INTERNAL">Internal</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="block-end">Until</Label>
          <Input id="block-end" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting} className="px-3 py-1.5 text-xs">{submitting ? 'Blocking…' : 'Block room'}</Button>
          <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
        </div>
      </form>
    </>,
    document.body,
  );
}

/**
 * Reserve a room for a not-yet-arrived guest, or (when the clicked date is
 * today) skip straight to a walk-in check-in: create the booking, then
 * immediately call /checkin with the room it just got assigned. Either way
 * this is a brand-new booking — there's no existing bookingId to attach to,
 * since the cell was empty.
 */
function ReserveOrCheckinForm({
  hotelId,
  room,
  date,
  mode,
  anchor,
  onCancel,
  onDone,
}: {
  hotelId: string;
  room: Room;
  date: string;
  mode: 'reserve' | 'checkin';
  anchor: Anchor;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [pickedGuest, setPickedGuest] = useState<PickedGuest | null>(null);
  const [checkOutDate, setCheckOutDate] = useState(toDateOnly(addDays(new Date(date), 1)));
  const [occupants, setOccupants] = useState('1');
  const [rate, setRate] = useState(String(Number(room.roomType.baseRate)));
  const [rateTouched, setRateTouched] = useState(false);
  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [rateQuoteLoading, setRateQuoteLoading] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const overCapacity = Number(occupants) > room.roomType.maxOccupancy;

  // Suggest a rate from active pricing rules once a check-out date is set —
  // same "instant base-rate fallback, then refine" pattern as the Bookings
  // page form. A stay only stores one flat rate, so this is the average
  // across the nights; `blended` (surfaced below the field) flags when the
  // nights actually priced differently.
  useEffect(() => {
    if (!hotelId || !checkOutDate) {
      setRateQuote(null);
      return;
    }
    setRateQuoteLoading(true);
    const timer = setTimeout(() => {
      apiFetch<RateQuote>(
        `/pricing-rules/quote-range?hotelId=${hotelId}&roomTypeId=${room.roomType.id}&checkIn=${date}&checkOut=${checkOutDate}`,
      )
        .then((res) => {
          setRateQuote(res);
          if (!rateTouched) setRate(String(res.averageRate));
        })
        .catch(() => setRateQuote(null))
        .finally(() => setRateQuoteLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, date, checkOutDate, room.roomType.id]);

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

      const booking = await apiFetch<{ id: string; bookingRooms: { id: string; roomId: string }[] }>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          hotelId,
          guestId,
          checkInDate: date,
          checkOutDate,
          rooms: [{ roomId: room.id, rate: Number(rate), occupants: Number(occupants) }],
          source: mode === 'checkin' ? 'WALK_IN' : 'DIRECT',
        }),
      });

      if (mode === 'checkin') {
        await apiFetch('/checkin', {
          method: 'POST',
          body: JSON.stringify({
            bookingId: booking.id,
            roomAssignments: booking.bookingRooms.map((br) => ({ bookingRoomId: br.id, roomId: br.roomId })),
            ...(deposit ? { depositAmount: Number(deposit) } : {}),
          }),
        });
      }

      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${mode === 'checkin' ? 'check in' : 'reserve'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <form
        onSubmit={handleSubmit}
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-xs font-medium text-slate-500">
          Room {room.roomNumber} · {mode === 'checkin' ? `Check in ${date}` : `Reserve from ${date}`}
        </p>

        <GuestPicker hotelId={hotelId} value={pickedGuest} onChange={setPickedGuest} />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cell-checkout">Check-out</Label>
            <Input id="cell-checkout" type="date" required min={toDateOnly(addDays(new Date(date), 1))} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="cell-occupants">Occupants</Label>
            <Input id="cell-occupants" type="number" min={1} required value={occupants} onChange={(e) => setOccupants(e.target.value)} className="text-sm" />
          </div>
          {mode === 'checkin' && (
            <div>
              <Label htmlFor="cell-deposit">Deposit</Label>
              <Input id="cell-deposit" type="number" min={0} placeholder="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="text-sm" />
            </div>
          )}
        </div>
        {overCapacity && <p className="text-xs text-rose-600">Sleeps a maximum of {room.roomType.maxOccupancy}.</p>}

        <div>
          <Label htmlFor="cell-rate">Rate/night</Label>
          <Input
            id="cell-rate"
            type="number"
            min={0}
            step="any"
            required
            value={rate}
            onChange={(e) => {
              setRateTouched(true);
              setRate(e.target.value);
            }}
            className="text-sm"
          />
          {rateQuoteLoading ? (
            <p className="mt-1 text-xs text-slate-400">Checking pricing rules…</p>
          ) : rateQuote && (rateQuote.averageRate !== rateQuote.baseRate || rateQuote.blended) ? (
            <p className="mt-1 text-xs text-slate-400">
              Pricing rules suggest {rateQuote.averageRate}
              {rateQuote.blended ? ' (varies by night — averaged)' : ''}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting} className="px-3 py-1.5 text-xs">
            {submitting ? (mode === 'checkin' ? 'Checking in…' : 'Reserving…') : mode === 'checkin' ? 'Check In' : 'Reserve'}
          </Button>
          <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-700">Back</button>
        </div>
      </form>
    </>,
    document.body,
  );
}

/**
 * What clicking an empty cell offers: reserve it for a future arrival, jump
 * straight to a walk-in check-in (only offered for today — check-in always
 * stamps the *actual*, current date, so offering it on a future cell would
 * silently check the guest in today regardless of which cell was clicked),
 * or block it for maintenance/etc (the original behavior, unchanged).
 */
function EmptyCellPopover({
  hotelId,
  room,
  date,
  isToday,
  anchor,
  onCancel,
  onDone,
}: {
  hotelId: string;
  room: Room;
  date: string;
  isToday: boolean;
  anchor: Anchor;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [view, setView] = useState<'menu' | 'reserve' | 'checkin' | 'block'>('menu');

  if (view === 'block') {
    return <BlockForm hotelId={hotelId} roomId={room.id} date={date} anchor={anchor} onCancel={() => setView('menu')} onDone={onDone} />;
  }
  if (view === 'reserve' || view === 'checkin') {
    return (
      <ReserveOrCheckinForm
        hotelId={hotelId}
        room={room}
        date={date}
        mode={view}
        anchor={anchor}
        onCancel={() => setView('menu')}
        onDone={onDone}
      />
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-52 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1.5 text-left shadow-popover"
      >
        <button
          type="button"
          onClick={() => setView('reserve')}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        >
          <CalendarPlus className="h-4 w-4 text-brand-600" /> Reserve
        </button>
        {isToday && (
          <button
            type="button"
            onClick={() => setView('checkin')}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogIn className="h-4 w-4 text-emerald-600" /> Check in now
          </button>
        )}
        <button
          type="button"
          onClick={() => setView('block')}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        >
          <Ban className="h-4 w-4 text-amber-600" /> Block room
        </button>
        <div className="border-t border-slate-100 pt-0.5">
          <button type="button" onClick={onCancel} className="w-full rounded-md px-2.5 py-1.5 text-center text-xs text-slate-400 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function CellActionPopover({
  hotelId,
  info,
  anchor,
  onDone,
  onCancel,
}: {
  hotelId: string;
  info: CellInfo;
  anchor: Anchor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRemove() {
    const confirmMessage = info.kind === 'booking' ? 'Cancel this booking?' : 'Remove this block?';
    if (!confirm(confirmMessage)) return;
    setSubmitting(true);
    setError(null);
    try {
      if (info.kind === 'booking') {
        await apiFetch(`/bookings/${info.id}/cancel`, { method: 'POST' });
      } else {
        await apiFetch(`/rooms/block/${info.id}?hotelId=${hotelId}`, { method: 'DELETE' });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${info.kind === 'booking' ? 'cancel booking' : 'remove block'}`);
      setSubmitting(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-xs font-medium text-slate-500">{info.kind === 'booking' ? 'Booking' : 'Block'}</p>
        <p className="text-sm font-medium text-slate-900">{info.label}</p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleRemove}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? 'Working…' : info.kind === 'booking' ? 'Cancel booking' : 'Remove block'}
          </button>
          <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-700">Close</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function nightsBetween(checkIn: string, checkOut: string) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// Read-only preview, pointer-events-none so it never steals the mouseleave that
// would otherwise dismiss it — it just tracks whatever cell is being hovered.
function HoverPreview({ anchor, children }: { anchor: Anchor; children: React.ReactNode }) {
  return createPortal(
    <div
      style={{ top: anchor.top, left: anchor.left }}
      className="pointer-events-none fixed z-50 w-72 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
    >
      {children}
    </div>,
    document.body,
  );
}

export default function CalendarPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date(new Date().toDateString()));
  const [activeCell, setActiveCell] = useState<{ roomId: string; date: string; anchor: Anchor } | null>(null);
  const [activeAction, setActiveAction] = useState<{
    cellKey: string;
    info: CellInfo;
    anchor: Anchor;
  } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    cellKey: string;
    kind: 'booking' | 'block';
    id: string;
    anchor: Anchor;
  } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(startDate, i)), [startDate]);
  const { colors: roomTypeColors, types: roomTypes } = useRoomTypeColors(rooms);
  const todayIso = toDateOnly(new Date());

  // Small delay before showing the preview so it doesn't flash while the mouse
  // is just passing through a row of cells on its way somewhere else.
  function handleCellMouseEnter(e: React.MouseEvent<HTMLElement>, cellKey: string, kind: 'booking' | 'block', id: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const PREVIEW_WIDTH = 288;
    const left = Math.min(rect.left, window.innerWidth - PREVIEW_WIDTH - 16);
    const anchor = { top: rect.bottom + 6, left };
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredCell({ cellKey, kind, id, anchor }), 200);
  }

  function handleCellMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoveredCell(null);
  }

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    Promise.all([
      apiFetch<Room[]>(`/rooms?hotelId=${hotelId}`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`),
      apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`),
    ])
      .then(async ([roomsData, confirmed, checkedIn]) => {
        setRooms(roomsData);
        setBookings([...confirmed.items, ...checkedIn.items]);
        const perRoomBlocks = await Promise.all(
          roomsData.map((r) => apiFetch<RoomBlock[]>(`/rooms/block?roomId=${r.id}`)),
        );
        setBlocks(perRoomBlocks.flat());
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  function activeBookingsFor(roomId: string) {
    return bookings.filter((b) => ['CONFIRMED', 'CHECKED_IN'].includes(b.status) && b.bookingRooms.some((br) => br.room.id === roomId));
  }

  function blockAt(roomId: string, iso: string) {
    return blocks.find((bl) => bl.roomId === roomId && iso >= bl.startDate.slice(0, 10) && iso < bl.endDate.slice(0, 10));
  }

  // Nights strictly between the check-in and check-out day — those two
  // boundary days are rendered as half-cells instead (see arrivalAt/departureAt),
  // so together an arrival's right half + the next room's departure's left
  // half reads as one full day, the same way a hotel whiteboard would show it.
  function midStayAt(roomId: string, iso: string) {
    return activeBookingsFor(roomId).find((b) => iso > b.checkInDate.slice(0, 10) && iso < b.checkOutDate.slice(0, 10));
  }

  function arrivalAt(roomId: string, iso: string) {
    return activeBookingsFor(roomId).find((b) => b.checkInDate.slice(0, 10) === iso);
  }

  function departureAt(roomId: string, iso: string) {
    return activeBookingsFor(roomId).find((b) => b.checkOutDate.slice(0, 10) === iso);
  }

  function bookingCellInfo(b: Booking, label: string): CellInfo {
    return { kind: 'booking', id: b.id, label, status: b.status };
  }

  // Whichever entity occupies the left/right half of this day for this room
  // — a block or booking fills both halves identically (it's a full-width
  // day), an arrival only fills the right half, a departure only the left.
  // Comparing today's edge against the neighboring day's opposite edge is
  // how adjacent cells decide whether to touch seamlessly (same entity) or
  // keep a gap (different entities, or nothing).
  type Occupant = { kind: 'booking' | 'block'; id: string } | null;

  function leftOccupant(roomId: string, iso: string): Occupant {
    const block = blockAt(roomId, iso);
    if (block) return { kind: 'block', id: block.id };
    const mid = midStayAt(roomId, iso);
    if (mid) return { kind: 'booking', id: mid.id };
    const dep = departureAt(roomId, iso);
    if (dep) return { kind: 'booking', id: dep.id };
    return null;
  }

  function rightOccupant(roomId: string, iso: string): Occupant {
    const block = blockAt(roomId, iso);
    if (block) return { kind: 'block', id: block.id };
    const mid = midStayAt(roomId, iso);
    if (mid) return { kind: 'booking', id: mid.id };
    const arr = arrivalAt(roomId, iso);
    if (arr) return { kind: 'booking', id: arr.id };
    return null;
  }

  function sameOccupant(a: Occupant, b: Occupant) {
    return !!a && !!b && a.kind === b.kind && a.id === b.id;
  }

  // Which visible day should carry this booking's guest name — the widest
  // cell available beats a half-cell, since a name barely fits in a half-day
  // column: prefer the first visible full mid-stay night, then the arrival
  // half, then (for a stay whose only visible day is its departure) that half.
  function labelDateForBooking(b: Booking): string {
    const isoDays = days.map(toDateOnly);
    const checkIn = b.checkInDate.slice(0, 10);
    const checkOut = b.checkOutDate.slice(0, 10);
    return (
      isoDays.find((iso) => iso > checkIn && iso < checkOut) ??
      isoDays.find((iso) => iso === checkIn) ??
      isoDays.find((iso) => iso === checkOut) ??
      ''
    );
  }

  // Renders one colored block — either the full cell (a block, or a mid-stay
  // night) or one half of it (an arrival or a departure sharing the day with
  // whatever's on the other half). Reuses the same activeAction/hoveredCell
  // state as before, keyed with `suffix` so the two halves of a cell (and the
  // full-cell case) never collide. `rounded` caps only the true ends of a
  // multi-day stay/block — every other edge stays square *and* butts flush
  // against its neighbor (the caller drops the <td>'s padding on that side),
  // so consecutive days read as one continuous bar, not separate chips.
  function renderBookingCell(
    info: CellInfo,
    roomId: string,
    iso: string,
    suffix: string,
    widthClass: string,
    rounded: { left: boolean; right: boolean },
  ) {
    const cellKey = `${roomId}:${iso}:${suffix}`;
    const isActionable = info.kind === 'block' || info.status === 'CONFIRMED';
    const isActionOpen = activeAction?.cellKey === cellKey;
    const isHovered = hoveredCell?.cellKey === cellKey && !isActionOpen;
    // Border only on the true outer edges of the bar (paired with the caller
    // dropping <td> padding on those same non-true edges) — so two cells
    // belonging to the same booking/block touch with no border and no gap,
    // while a genuinely different neighbor (or empty space) still gets one.
    const roundedClass = `${rounded.left ? 'rounded-l-md' : ''} ${rounded.right ? 'rounded-r-md' : ''}`.trim();
    const borderClass = `border-y ${rounded.left ? 'border-l' : ''} ${rounded.right ? 'border-r' : ''}`.trim();
    const cellStyle = `flex h-full items-center truncate ${roundedClass} ${borderClass} px-1.5 text-xs font-medium ${
      info.kind === 'block'
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : info.status === 'CHECKED_IN'
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
          : 'bg-sky-100 text-sky-800 border-sky-300'
    }`;

    return (
      <div
        key={suffix}
        className={`relative h-8 ${widthClass}`}
        onMouseEnter={(e) => handleCellMouseEnter(e, cellKey, info.kind, info.id)}
        onMouseLeave={handleCellMouseLeave}
      >
        {isActionable ? (
          <button
            type="button"
            onClick={(e) => {
              handleCellMouseLeave();
              if (isActionOpen) {
                setActiveAction(null);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const POPOVER_WIDTH = 256;
              const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
              setActiveAction({ cellKey, info, anchor: { top: rect.bottom + 4, left } });
            }}
            className={`w-full cursor-pointer ${cellStyle}`}
          >
            {info.label}
          </button>
        ) : (
          <div className={cellStyle}>{info.label}</div>
        )}
        {isActionOpen && (
          <CellActionPopover
            hotelId={hotelId!}
            info={activeAction.info}
            anchor={activeAction.anchor}
            onCancel={() => setActiveAction(null)}
            onDone={() => {
              setActiveAction(null);
              reload();
            }}
          />
        )}
        {isHovered &&
          hoveredCell.kind === 'booking' &&
          (() => {
            const booking = bookings.find((b) => b.id === hoveredCell.id);
            if (!booking) return null;
            return (
              <HoverPreview anchor={hoveredCell.anchor}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {booking.guest.fullName}
                    <GuestBadges guest={booking.guest} />
                  </p>
                  <StatusBadge status={booking.status} />
                </div>
                <p className="text-xs text-slate-500">
                  {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)} · {nightsBetween(booking.checkInDate, booking.checkOutDate)} night(s)
                </p>
                <p className="text-xs text-slate-500">
                  Room{booking.bookingRooms.length > 1 ? 's' : ''}:{' '}
                  {booking.bookingRooms.map((br) => `${br.room.roomNumber} (${br.occupants})`).join(', ')}
                </p>
                {(booking.guest.email || booking.guest.phone) && (
                  <p className="text-xs text-slate-500">{[booking.guest.email, booking.guest.phone].filter(Boolean).join(' · ')}</p>
                )}
                <p className="text-xs text-slate-400">Source: {booking.source}</p>
              </HoverPreview>
            );
          })()}
        {isHovered &&
          hoveredCell.kind === 'block' &&
          (() => {
            const blk = blocks.find((bl) => bl.id === hoveredCell.id);
            if (!blk) return null;
            return (
              <HoverPreview anchor={hoveredCell.anchor}>
                <p className="text-sm font-semibold text-slate-900">Room blocked</p>
                <p className="text-xs text-slate-500">Reason: {blk.reason}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(blk.startDate)} → {formatDate(blk.endDate)}
                </p>
                {blk.notes && <p className="text-xs text-slate-500">{blk.notes}</p>}
              </HoverPreview>
            );
          })()}
      </div>
    );
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader
        title="Availability Calendar"
        subtitle="Click an empty cell to block a room."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setStartDate(addDays(startDate, -DAYS_SHOWN))} className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setStartDate(new Date(new Date().toDateString()))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Today
            </button>
            <button onClick={() => setStartDate(addDays(startDate, DAYS_SHOWN))} className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sky-100 ring-1 ring-sky-300" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Checked in</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" /> Blocked</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-white ring-1 ring-slate-300" /> Available (click to block)</span>
      </div>
      {roomTypes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="text-slate-400">Room type:</span>
          {roomTypes.map(([id, name]) => (
            <span key={id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${roomTypeColors.get(id)}`} /> {name}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-slate-400">No rooms yet — add some from the Rooms page.</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[7rem] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500">Room</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[6rem] border-b border-slate-200 bg-slate-50 px-2 py-3 text-center text-xs font-medium text-slate-500">
                    {d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      <span
                        title={room.roomType.name}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${roomTypeColors.get(room.roomType.id)}`}
                      />
                      {room.roomNumber}
                    </span>
                  </td>
                  {days.map((d, i) => {
                    const iso = toDateOnly(d);
                    const prevIso = i > 0 ? toDateOnly(days[i - 1]) : null;
                    const nextIso = i < days.length - 1 ? toDateOnly(days[i + 1]) : null;
                    const isActive = activeCell?.roomId === room.id && activeCell?.date === iso;

                    const block = blockAt(room.id, iso);
                    const midStay = block ? undefined : midStayAt(room.id, iso);
                    const arrival = block || midStay ? undefined : arrivalAt(room.id, iso);
                    const departure = block || midStay ? undefined : departureAt(room.id, iso);

                    // Does this cell's left/right edge butt against the *same*
                    // booking/block on the neighboring day? If so, that edge
                    // gets no padding, no border, and no rounding — the two
                    // cells fuse into one bar. Otherwise it keeps its inset,
                    // whether the neighbor is empty or a genuinely different
                    // booking/block.
                    const left = leftOccupant(room.id, iso);
                    const right = rightOccupant(room.id, iso);
                    const padLeft = !prevIso || !sameOccupant(rightOccupant(room.id, prevIso), left);
                    const padRight = !nextIso || !sameOccupant(leftOccupant(room.id, nextIso), right);

                    const fullInfo: CellInfo | null = block
                      ? { kind: 'block', id: block.id, label: padLeft ? block.reason : '', status: block.reason }
                      : midStay
                        ? bookingCellInfo(midStay, labelDateForBooking(midStay) === iso ? midStay.guest.fullName : '')
                        : null;

                    return (
                      <td
                        key={iso}
                        className={`relative border-b border-slate-100 py-1.5 text-center ${padLeft ? 'pl-1.5' : 'pl-0'} ${padRight ? 'pr-1.5' : 'pr-0'}`}
                      >
                        {fullInfo ? (
                          renderBookingCell(fullInfo, room.id, iso, 'full', 'w-full', { left: padLeft, right: padRight })
                        ) : arrival || departure ? (
                          <div className="flex">
                            {departure
                              ? renderBookingCell(
                                  bookingCellInfo(departure, labelDateForBooking(departure) === iso ? departure.guest.fullName : ''),
                                  room.id,
                                  iso,
                                  'departure',
                                  'w-1/2',
                                  { left: padLeft, right: true },
                                )
                              : <div className="w-1/2" />}
                            {arrival
                              ? renderBookingCell(
                                  bookingCellInfo(arrival, labelDateForBooking(arrival) === iso ? arrival.guest.fullName : ''),
                                  room.id,
                                  iso,
                                  'arrival',
                                  'w-1/2',
                                  { left: true, right: padRight },
                                )
                              : <div className="w-1/2" />}
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              if (isActive) {
                                setActiveCell(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              // Sized for the widest popover state (the reserve/check-in
                              // form), not just the initial menu, so switching views can't
                              // push it past the right edge of the viewport.
                              const POPOVER_WIDTH = 320;
                              const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
                              setActiveCell({ roomId: room.id, date: iso, anchor: { top: rect.bottom + 4, left } });
                            }}
                            className="h-8 w-full rounded-md hover:bg-slate-100"
                          />
                        )}
                        {isActive && (
                          <EmptyCellPopover
                            hotelId={hotelId}
                            room={room}
                            date={iso}
                            isToday={iso === todayIso}
                            anchor={activeCell.anchor}
                            onCancel={() => setActiveCell(null)}
                            onDone={() => {
                              setActiveCell(null);
                              reload();
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
