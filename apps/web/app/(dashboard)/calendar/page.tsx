'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';

const DAYS_SHOWN = 14;

interface Room {
  id: string;
  roomNumber: string;
}

interface Booking {
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string };
  bookingRooms: { room: { id: string } }[];
}

interface RoomBlock {
  id: string;
  roomId: string;
  reason: string;
  startDate: string;
  endDate: string;
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

export default function CalendarPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date(new Date().toDateString()));
  const [activeCell, setActiveCell] = useState<{ roomId: string; date: string; anchor: Anchor } | null>(null);

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(startDate, i)), [startDate]);

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
    if (booking) return { kind: 'booking' as const, label: booking.guest.fullName, status: booking.status };

    const block = blocks.find((bl) => bl.roomId === roomId && iso >= bl.startDate.slice(0, 10) && iso < bl.endDate.slice(0, 10));
    if (block) return { kind: 'block' as const, label: block.reason, status: block.reason };

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

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sky-100 ring-1 ring-sky-300" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Checked in</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" /> Blocked</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-white ring-1 ring-slate-300" /> Available (click to block)</span>
      </div>

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
                    {room.roomNumber}
                  </td>
                  {days.map((d) => {
                    const iso = toDateOnly(d);
                    const info = cellInfo(room.id, d);
                    const isActive = activeCell?.roomId === room.id && activeCell?.date === iso;
                    return (
                      <td key={iso} className="relative border-b border-slate-100 p-1 text-center">
                        {info ? (
                          <div
                            title={info.label}
                            className={`truncate rounded px-1 py-1.5 text-[10px] font-medium ring-1 ring-inset ${
                              info.kind === 'block'
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : info.status === 'CHECKED_IN'
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                  : 'bg-sky-50 text-sky-700 ring-sky-200'
                            }`}
                          >
                            {info.label}
                          </div>
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
