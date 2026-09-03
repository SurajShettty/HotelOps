'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BedDouble, CircleCheck, Clock3, Sparkles, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { todayInTimeZone } from '@/lib/format';
import { Card } from './primitives';

export interface FloorMapRoom {
  id: string;
  roomNumber: string;
  status: string;
  floor: string | null;
}

interface BookingLite {
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string };
  bookingRooms: { room: { id: string } }[];
}

interface RoomBlockLite {
  reason: string;
  startDate: string;
  endDate: string;
}

type TileState = 'MAINTENANCE' | 'OCCUPIED' | 'DIRTY' | 'RESERVED' | 'AVAILABLE';

// Icons reuse the app's existing associations where one already exists —
// Wrench for maintenance (notifications bell), Sparkles for cleaning
// (Housekeeping nav item) — so this map reads as the same visual language,
// not a new one.
const TILE_STYLES: Record<
  TileState,
  { label: string; icon: React.ComponentType<{ className?: string }>; dot: string; tile: string; badge: string; iconColor: string }
> = {
  AVAILABLE: {
    label: 'Available',
    icon: CircleCheck,
    dot: 'bg-emerald-500',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-50',
    tile: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100',
  },
  OCCUPIED: {
    label: 'Occupied',
    icon: BedDouble,
    dot: 'bg-rose-500',
    iconColor: 'text-rose-600',
    badge: 'bg-rose-50',
    tile: 'border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300 hover:bg-rose-100',
  },
  RESERVED: {
    label: 'Reserved',
    icon: Clock3,
    dot: 'bg-amber-400',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-50',
    tile: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300 hover:bg-amber-100',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    icon: Wrench,
    dot: 'bg-sky-500',
    iconColor: 'text-sky-600',
    badge: 'bg-sky-50',
    tile: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300 hover:bg-sky-100',
  },
  DIRTY: {
    label: 'Needs Cleaning',
    icon: Sparkles,
    dot: 'bg-slate-400',
    iconColor: 'text-slate-500',
    badge: 'bg-slate-100',
    tile: 'border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-200',
  },
};

// Shown in this fixed order everywhere (legend, summary strip, floor bars) regardless of which states are actually present.
const TILE_ORDER: TileState[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'DIRTY'];

// Numeric-aware so floor "10" sorts after "2", not before — floors are almost
// always numeric strings, and a plain string sort reads wrong for a visual map.
function sortFloors(floors: string[]) {
  return [...floors].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

function tileState(room: FloorMapRoom, blockReasonByRoomId: Map<string, string>, reservedRoomIds: Set<string>): TileState {
  if (room.status === 'OUT_OF_ORDER' || blockReasonByRoomId.has(room.id)) return 'MAINTENANCE';
  if (room.status === 'OCCUPIED') return 'OCCUPIED';
  if (room.status === 'DIRTY') return 'DIRTY';
  if (reservedRoomIds.has(room.id)) return 'RESERVED';
  return 'AVAILABLE';
}

/** Why a room is in the MAINTENANCE tile state — the active RoomBlock's reason, if any. */
function maintenanceReason(room: FloorMapRoom, blockReasonByRoomId: Map<string, string>): string | null {
  return blockReasonByRoomId.get(room.id) ?? null;
}

function countByState(states: TileState[]) {
  const counts = new Map<TileState, number>();
  for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

/** A slim horizontal stacked bar showing the state mix for one floor — proportion at a glance before scanning individual tiles. */
function StateBar({ counts, total }: { counts: Map<TileState, number>; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
      {TILE_ORDER.filter((s) => counts.get(s)).map((s) => (
        <span key={s} className={TILE_STYLES[s].dot} style={{ width: `${((counts.get(s) ?? 0) / total) * 100}%` }} />
      ))}
    </div>
  );
}

function SummaryStrip({ counts, total }: { counts: Map<TileState, number>; total: number }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {TILE_ORDER.map((state) => {
        const style = TILE_STYLES[state];
        const Icon = style.icon;
        const count = counts.get(state) ?? 0;
        return (
          <Card key={state} className="flex items-center gap-3 p-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.badge}`}>
              <Icon className={`h-4 w-4 ${style.iconColor}`} />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight text-slate-900">{count}</div>
              <div className="truncate text-[11px] text-slate-500">{style.label}</div>
            </div>
          </Card>
        );
      })}
      <div className="col-span-2 flex items-center px-1 text-xs text-slate-400 sm:col-span-5">{total} rooms total</div>
    </div>
  );
}

/**
 * Floor-wise visual map: every room as a colored tile, grouped by floor.
 * Color comes from a priority stack (blocked/out-of-order beats occupied
 * beats dirty beats reserved beats available) rather than raw Room.status
 * alone — "reserved" and "blocked-right-now" aren't stored on the room row,
 * they're derived from CONFIRMED bookings and active RoomBlocks the same way
 * the Calendar page and dashboard alerts already do.
 */
export function FloorMap({ rooms, hotelId }: { rooms: FloorMapRoom[]; hotelId: string }) {
  const { timezone } = useCurrentHotel();
  const [reservedRoomIds, setReservedRoomIds] = useState<Set<string>>(new Set());
  // roomId -> the active RoomBlock's reason, for rooms blocked without the
  // Room itself being OUT_OF_ORDER (e.g. a future maintenance hold).
  const [blockReasonByRoomId, setBlockReasonByRoomId] = useState<Map<string, string>>(new Map());
  const [occupantByRoomId, setOccupantByRoomId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<{ room: FloorMapRoom; anchor: { top: number; left: number } } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hotelId || rooms.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<{ items: BookingLite[] }>(`/bookings?hotelId=${hotelId}&status=CONFIRMED&pageSize=200`),
      apiFetch<{ items: BookingLite[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`),
      Promise.all(rooms.map((r) => apiFetch<RoomBlockLite[]>(`/rooms/block?roomId=${r.id}`))),
    ])
      .then(([confirmed, checkedIn, blocksPerRoom]) => {
        if (cancelled) return;
        const today = todayInTimeZone(timezone);

        const reserved = new Set<string>();
        for (const b of confirmed.items) {
          if (b.checkInDate.slice(0, 10) <= today && today < b.checkOutDate.slice(0, 10)) {
            for (const br of b.bookingRooms) reserved.add(br.room.id);
          }
        }

        const occupants = new Map<string, string>();
        for (const b of checkedIn.items) {
          for (const br of b.bookingRooms) occupants.set(br.room.id, b.guest.fullName);
        }

        const blockReasons = new Map<string, string>();
        blocksPerRoom.forEach((blocks, i) => {
          const active = blocks.find((bl) => bl.startDate.slice(0, 10) <= today && today < bl.endDate.slice(0, 10));
          if (active) blockReasons.set(rooms[i].id, active.reason);
        });

        setReservedRoomIds(reserved);
        setOccupantByRoomId(occupants);
        setBlockReasonByRoomId(blockReasons);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, rooms.length]);

  const floorGroups = useMemo(() => {
    const byFloor = new Map<string, FloorMapRoom[]>();
    for (const room of rooms) {
      const key = room.floor ?? 'Unassigned';
      if (!byFloor.has(key)) byFloor.set(key, []);
      byFloor.get(key)!.push(room);
    }
    for (const list of byFloor.values()) {
      list.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    }
    const floors = sortFloors([...byFloor.keys()].filter((f) => f !== 'Unassigned'));
    if (byFloor.has('Unassigned')) floors.push('Unassigned');
    return floors.map((floor) => ({ floor, rooms: byFloor.get(floor)! }));
  }, [rooms]);

  const allStates = useMemo(() => rooms.map((r) => tileState(r, blockReasonByRoomId, reservedRoomIds)), [rooms, blockReasonByRoomId, reservedRoomIds]);
  const overallCounts = useMemo(() => countByState(allStates), [allStates]);

  function handleEnter(e: React.MouseEvent<HTMLElement>, room: FloorMapRoom) {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = { top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 224 - 16) };
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered({ room, anchor }), 150);
  }
  function handleLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(null);
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rooms.length === 0) return null;

  return (
    <div>
      <SummaryStrip counts={overallCounts} total={rooms.length} />

      <div className="space-y-5">
        {floorGroups.map(({ floor, rooms: floorRooms }) => {
          const floorStates = floorRooms.map((r) => tileState(r, blockReasonByRoomId, reservedRoomIds));
          const floorCounts = countByState(floorStates);
          return (
            <Card key={floor} className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-800 text-xs font-semibold text-white">
                    {floor === 'Unassigned' ? '—' : floor}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{floor === 'Unassigned' ? 'Unassigned floor' : `Floor ${floor}`}</h3>
                    <p className="text-[11px] text-slate-400">{floorRooms.length} room{floorRooms.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <StateBar counts={floorCounts} total={floorRooms.length} />
              </div>

              <div className="flex flex-wrap gap-2.5">
                {floorRooms.map((room) => {
                  const state = tileState(room, blockReasonByRoomId, reservedRoomIds);
                  const style = TILE_STYLES[state];
                  const occupant = occupantByRoomId.get(room.id);
                  const reason = state === 'MAINTENANCE' ? maintenanceReason(room, blockReasonByRoomId) : null;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onMouseEnter={(e) => handleEnter(e, room)}
                      onMouseLeave={handleLeave}
                      className={`flex w-32 flex-col items-start gap-0.5 rounded-xl border p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-popover ${style.tile}`}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="text-base font-bold leading-none tabular-nums">{room.roomNumber}</span>
                        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${style.dot}`} />
                      </span>
                      <span className={`text-[10.5px] font-semibold ${style.iconColor}`}>{style.label}</span>
                      {occupant && <span className="w-full truncate text-[10.5px] opacity-70">{occupant}</span>}
                      {reason && <span className="w-full truncate text-[10.5px] opacity-70">{reason}</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {hovered &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={handleLeave} />
            <div
              style={{ top: hovered.anchor.top, left: hovered.anchor.left }}
              className="pointer-events-none fixed z-50 w-56 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
            >
              <p className="text-sm font-semibold text-slate-900">Room {hovered.room.roomNumber}</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`h-2 w-2 rounded-full ${TILE_STYLES[tileState(hovered.room, blockReasonByRoomId, reservedRoomIds)].dot}`} />
                {TILE_STYLES[tileState(hovered.room, blockReasonByRoomId, reservedRoomIds)].label}
                {maintenanceReason(hovered.room, blockReasonByRoomId) && ` — ${maintenanceReason(hovered.room, blockReasonByRoomId)}`}
              </p>
              {occupantByRoomId.has(hovered.room.id) && (
                <p className="text-xs text-slate-500">Guest: {occupantByRoomId.get(hovered.room.id)}</p>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
