'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';

const DAYS_SHOWN = 14;

interface RoomType {
  id: string;
  name: string;
}

interface Room {
  id: string;
  roomNumber: string;
  roomType: RoomType;
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

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
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

function CellActionPopover({
  hotelId,
  info,
  anchor,
  onDone,
  onCancel,
}: {
  hotelId: string;
  info: { kind: 'booking' | 'block'; id: string; label: string; status: string };
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
    info: { kind: 'booking' | 'block'; id: string; label: string; status: string };
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

  function cellInfo(roomId: string, date: Date) {
    const iso = toDateOnly(date);
    const booking = bookings.find(
      (b) =>
        ['CONFIRMED', 'CHECKED_IN'].includes(b.status) &&
        b.bookingRooms.some((br) => br.room.id === roomId) &&
        iso >= b.checkInDate.slice(0, 10) &&
        iso < b.checkOutDate.slice(0, 10),
    );
    if (booking) return { kind: 'booking' as const, id: booking.id, label: booking.guest.fullName, status: booking.status };

    const block = blocks.find((bl) => bl.roomId === roomId && iso >= bl.startDate.slice(0, 10) && iso < bl.endDate.slice(0, 10));
    if (block) return { kind: 'block' as const, id: block.id, label: block.reason, status: block.reason };

    return null;
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
                <th className="sticky left-0 z-10 min-w-[6rem] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500">Room</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="min-w-[4.5rem] border-b border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-500">
                    {d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      <span
                        title={room.roomType.name}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${roomTypeColors.get(room.roomType.id)}`}
                      />
                      {room.roomNumber}
                    </span>
                  </td>
                  {days.map((d) => {
                    const iso = toDateOnly(d);
                    const info = cellInfo(room.id, d);
                    const cellKey = `${room.id}:${iso}`;
                    const isActive = activeCell?.roomId === room.id && activeCell?.date === iso;
                    const isActionable = !!info && (info.kind === 'block' || info.status === 'CONFIRMED');
                    const isActionOpen = activeAction?.cellKey === cellKey;
                    const cellStyle = info
                      ? `truncate rounded px-1 py-1.5 text-[10px] font-medium ring-1 ring-inset ${
                          info.kind === 'block'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : info.status === 'CHECKED_IN'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-sky-50 text-sky-700 ring-sky-200'
                        }`
                      : '';
                    const isHovered = hoveredCell?.cellKey === cellKey && !isActionOpen;
                    return (
                      <td
                        key={iso}
                        className="relative border-b border-slate-100 p-1 text-center"
                        onMouseEnter={info ? (e) => handleCellMouseEnter(e, cellKey, info.kind, info.id) : undefined}
                        onMouseLeave={info ? handleCellMouseLeave : undefined}
                      >
                        {info ? (
                          isActionable ? (
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
                            <div className={cellStyle}>
                              {info.label}
                            </div>
                          )
                        ) : (
                          <button
                            onClick={(e) => {
                              if (isActive) {
                                setActiveCell(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const POPOVER_WIDTH = 256;
                              const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
                              setActiveCell({ roomId: room.id, date: iso, anchor: { top: rect.bottom + 4, left } });
                            }}
                            className="h-6 w-full rounded hover:bg-slate-100"
                          />
                        )}
                        {isActive && (
                          <BlockForm
                            hotelId={hotelId}
                            roomId={room.id}
                            date={iso}
                            anchor={activeCell.anchor}
                            onCancel={() => setActiveCell(null)}
                            onDone={() => {
                              setActiveCell(null);
                              reload();
                            }}
                          />
                        )}
                        {isActionOpen && (
                          <CellActionPopover
                            hotelId={hotelId}
                            info={activeAction.info}
                            anchor={activeAction.anchor}
                            onCancel={() => setActiveAction(null)}
                            onDone={() => {
                              setActiveAction(null);
                              reload();
                            }}
                          />
                        )}
                        {isHovered && hoveredCell.kind === 'booking' && (() => {
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
                        {isHovered && hoveredCell.kind === 'block' && (() => {
                          const block = blocks.find((bl) => bl.id === hoveredCell.id);
                          if (!block) return null;
                          return (
                            <HoverPreview anchor={hoveredCell.anchor}>
                              <p className="text-sm font-semibold text-slate-900">Room blocked</p>
                              <p className="text-xs text-slate-500">Reason: {block.reason}</p>
                              <p className="text-xs text-slate-500">
                                {formatDate(block.startDate)} → {formatDate(block.endDate)}
                              </p>
                              {block.notes && <p className="text-xs text-slate-500">{block.notes}</p>}
                            </HoverPreview>
                          );
                        })()}
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
