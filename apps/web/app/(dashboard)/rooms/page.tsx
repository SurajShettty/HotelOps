'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bed, Check, ChevronDown, LayoutGrid, List, Pencil, Plus, Receipt, Sparkles, Trash2, Wrench } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { todayInTimeZone } from '@/lib/format';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { AmenitiesEditor, AmenitiesList } from '@/components/ui/amenities';
import { FloorMap } from '@/components/ui/floor-map';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'DIRTY', label: 'Dirty' },
  { value: 'OUT_OF_ORDER', label: 'Out of order' },
];

// Same reasons/values as the Calendar's "Block room" — a block created here
// is the exact same RoomBlock the Calendar reads, so they always agree on
// which rooms are unavailable and why.
const BLOCK_REASONS: { value: string; label: string }[] = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RENOVATION', label: 'Renovation' },
  { value: 'VIP', label: 'VIP hold' },
  { value: 'INTERNAL', label: 'Internal' },
];

interface RoomType {
  id: string;
  name: string;
  baseRate: string;
  baseOccupancy: number;
  maxOccupancy: number;
  amenities: unknown;
}

interface Room {
  id: string;
  roomNumber: string;
  status: string;
  floor: string | null;
  roomType: RoomType;
}

interface RoomBlock {
  id: string;
  roomId: string;
  reason: string;
  startDate: string;
  endDate: string;
}

interface RoomCharge {
  id: string;
  description: string;
  amount: string;
  createdAt: string;
  addedBy: { fullName: string };
}

interface Anchor {
  top: number;
  left: number;
}

/**
 * Lets staff log an incidental (water bottle, minibar, etc.) against
 * whichever guest is currently occupying this room — resolved server-side to
 * the active booking, so front desk / housekeeping only ever think in terms
 * of the room number, not booking IDs. Everything logged here rolls into the
 * checkout folio automatically (see CheckoutService.computeFolio).
 */
function RoomChargesPopover({ room, anchor, onClose }: { room: Room; anchor: Anchor; onClose: () => void }) {
  const { hotelId } = useCurrentHotel();
  const [charges, setCharges] = useState<RoomCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    apiFetch<RoomCharge[]>(`/room-charges?roomId=${room.id}&hotelId=${hotelId}`)
      .then(setCharges)
      .catch(() => setCharges([]))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [room.id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/room-charges?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify({ roomId: room.id, description: description.trim(), amount: Number(amount) }),
      });
      setDescription('');
      setAmount('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add charge');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/room-charges/${id}?hotelId=${hotelId}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove charge');
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        <p className="text-xs font-medium text-slate-500">Room {room.roomNumber} — charges this stay</p>
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : charges.length === 0 ? (
          <p className="text-sm text-slate-400">No charges logged yet.</p>
        ) : (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-700" title={c.description}>{c.description}</span>
                <span className="flex shrink-0 items-center gap-2 text-slate-500">
                  {c.amount}
                  <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex gap-2 border-t border-slate-100 pt-3">
          <Input placeholder="e.g. Water bottle" value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm" />
          <Input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 text-sm" />
          <button type="submit" disabled={submitting} className="shrink-0 rounded-lg bg-brand-800 px-2.5 py-2 text-white hover:bg-brand-900 disabled:opacity-50">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>,
    document.body,
  );
}

function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Takes a room out of service by creating a RoomBlock — the same record the
 * Calendar's "Block room" creates and reads, so a block made here shows up
 * there immediately (and vice versa) instead of the two views ever disagreeing.
 * assertRoomsAvailable (run server-side on create) already refuses this if
 * the room has an active booking, and the same check already keeps a blocked
 * room out of every availability/booking search.
 */
function BlockRoomPopover({
  room,
  hotelId,
  today,
  anchor,
  onClose,
  onDone,
}: {
  room: Room;
  hotelId: string;
  today: string;
  anchor: Anchor;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(BLOCK_REASONS[0].value);
  const [endDate, setEndDate] = useState(addDaysIso(today, 1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/rooms/block', {
        method: 'POST',
        body: JSON.stringify({ hotelId, roomId: room.id, reason, startDate: today, endDate }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to block room');
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        <p className="text-xs font-medium text-slate-500">Block Room {room.roomNumber} from {today}</p>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div>
          <Label htmlFor={`block-reason-${room.id}`}>Reason</Label>
          <Select id={`block-reason-${room.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm">
            {BLOCK_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`block-until-${room.id}`}>Until</Label>
          <Input id={`block-until-${room.id}`} type="date" required min={addDaysIso(today, 1)} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? 'Blocking…' : 'Block room'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Lets the "until" date on an active block be pushed out or pulled in, or the block removed entirely — without a delete-and-recreate round trip. */
function EditBlockPopover({
  block,
  hotelId,
  anchor,
  onClose,
  onDone,
}: {
  block: RoomBlock;
  hotelId: string;
  anchor: Anchor;
  onClose: () => void;
  onDone: () => void;
}) {
  const [endDate, setEndDate] = useState(block.endDate.slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/rooms/block/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ hotelId, endDate }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update block');
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/rooms/block/${block.id}?hotelId=${hotelId}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove block');
      setSubmitting(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ top: anchor.top, left: anchor.left }}
        className="fixed z-50 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-popover"
      >
        <p className="text-xs font-medium text-slate-500">
          {BLOCK_REASONS.find((r) => r.value === block.reason)?.label ?? block.reason} · since {block.startDate.slice(0, 10)}
        </p>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div>
          <Label htmlFor={`edit-block-until-${block.id}`}>Until</Label>
          <Input
            id={`edit-block-until-${block.id}`}
            type="date"
            required
            min={addDaysIso(block.startDate.slice(0, 10), 1)}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleRemove}
            disabled={submitting}
            className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
          >
            Remove block
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

export default function RoomsPage() {
  const { hotelId, ready, timezone } = useCurrentHotel();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  // Room id -> the block currently in effect (today falls within its date
  // range) — the same RoomBlock rows the Calendar reads, so this list and
  // the Calendar always agree on which rooms are unavailable and why.
  const [activeBlockByRoomId, setActiveBlockByRoomId] = useState<Map<string, RoomBlock>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeRate, setNewTypeRate] = useState('');
  const [newTypeBaseOccupancy, setNewTypeBaseOccupancy] = useState('2');
  const [newTypeMaxOccupancy, setNewTypeMaxOccupancy] = useState('3');
  const [newTypeAmenities, setNewTypeAmenities] = useState<string[]>([]);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomTypeId, setNewRoomTypeId] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');

  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editFloorValue, setEditFloorValue] = useState('');

  const [showAddType, setShowAddType] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);

  const [activeChargeRoom, setActiveChargeRoom] = useState<{ room: Room; anchor: Anchor } | null>(null);
  const [requestingServiceId, setRequestingServiceId] = useState<string | null>(null);
  const [serviceRequestedIds, setServiceRequestedIds] = useState<Set<string>>(new Set());
  const [blockRoomTarget, setBlockRoomTarget] = useState<{ room: Room; anchor: Anchor } | null>(null);
  const [editBlockTarget, setEditBlockTarget] = useState<{ block: RoomBlock; anchor: Anchor } | null>(null);

  async function handleRequestService(room: Room) {
    if (!hotelId) return;
    setRequestingServiceId(room.id);
    setError(null);
    try {
      await apiFetch('/housekeeping/tasks/service-request', {
        method: 'POST',
        body: JSON.stringify({ hotelId, roomId: room.id }),
      });
      setServiceRequestedIds((prev) => new Set(prev).add(room.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request service');
    } finally {
      setRequestingServiceId(null);
    }
  }

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    const params = new URLSearchParams({ hotelId });
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('roomTypeId', typeFilter);
    Promise.all([
      apiFetch<RoomType[]>(`/room-types?hotelId=${hotelId}`),
      apiFetch<Room[]>(`/rooms?${params.toString()}`),
    ])
      .then(async ([types, roomsData]) => {
        setRoomTypes(types);
        setRooms(roomsData);
        if (!newRoomTypeId && types.length > 0) setNewRoomTypeId(types[0].id);

        const today = todayInTimeZone(timezone);
        const blocksPerRoom = await Promise.all(roomsData.map((r) => apiFetch<RoomBlock[]>(`/rooms/block?roomId=${r.id}`)));
        const activeByRoomId = new Map<string, RoomBlock>();
        blocksPerRoom.forEach((blocks, i) => {
          const active = blocks.find((bl) => bl.startDate.slice(0, 10) <= today && today < bl.endDate.slice(0, 10));
          if (active) activeByRoomId.set(roomsData[i].id, active);
        });
        setActiveBlockByRoomId(activeByRoomId);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId, statusFilter, typeFilter]);

  // Floors are free text, not a managed list, so filtering happens client-side
  // against whatever rooms the status/type filters already returned — that way
  // picking a floor never shrinks the set of floors offered in the dropdown.
  const floors = useMemo(
    () =>
      Array.from(new Set(rooms.map((r) => r.floor).filter((f): f is string => !!f))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [rooms],
  );
  const visibleRooms = floorFilter ? rooms.filter((r) => r.floor === floorFilter) : rooms;

  async function handleCreateType(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/room-types', {
        method: 'POST',
        body: JSON.stringify({
          hotelId,
          name: newTypeName,
          baseRate: Number(newTypeRate),
          baseOccupancy: Number(newTypeBaseOccupancy),
          maxOccupancy: Number(newTypeMaxOccupancy),
          amenities: newTypeAmenities,
        }),
      });
      setNewTypeName('');
      setNewTypeRate('');
      setNewTypeBaseOccupancy('2');
      setNewTypeMaxOccupancy('3');
      setNewTypeAmenities([]);
      setShowAddType(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room type');
    }
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({ hotelId, roomTypeId: newRoomTypeId, roomNumber: newRoomNumber, floor: newRoomFloor || undefined }),
      });
      setNewRoomNumber('');
      setNewRoomFloor('');
      setShowAddRoom(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room');
    }
  }

  function startEditFloor(room: Room) {
    setEditingFloorId(room.id);
    setEditFloorValue(room.floor ?? '');
  }

  async function saveFloor(id: string) {
    if (!hotelId) return;
    setError(null);
    try {
      await apiFetch(`/rooms/${id}/floor`, {
        method: 'PATCH',
        body: JSON.stringify({ hotelId, floor: editFloorValue || null }),
      });
      setEditingFloorId(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update floor');
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Rooms" subtitle="Room types and inventory for this property." />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      <Card className="mb-4 flex flex-nowrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setShowAddType((v) => !v)}
          className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
            showAddType ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Plus className="h-4 w-4" /> Room Type
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAddType ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setShowAddRoom((v) => !v)}
          className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
            showAddRoom ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Plus className="h-4 w-4" /> Room
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAddRoom ? 'rotate-180' : ''}`} />
        </button>

        <span className="h-6 w-px shrink-0 bg-slate-200" />

        {view === 'list' && (
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-0 grow basis-32">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        )}
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-0 grow basis-32">
          <option value="">All room types</option>
          {roomTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} className="min-w-0 grow basis-28">
          <option value="">All floors</option>
          {floors.map((f) => (
            <option key={f} value={f}>Floor {f}</option>
          ))}
        </Select>

        <span className="h-6 w-px shrink-0 bg-slate-200" />

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-300 p-0.5">
          <button
            type="button"
            title="List view"
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              view === 'list' ? 'bg-brand-800 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            title="Floor map"
            onClick={() => {
              setView('map');
              setStatusFilter('');
            }}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              view === 'map' ? 'bg-brand-800 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Floor Map
          </button>
        </div>
      </Card>

      {(showAddType || showAddRoom) && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {showAddType && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Plus className="h-4 w-4 text-brand-600" /> Add room type
              </h2>
              <form onSubmit={handleCreateType} className="space-y-3">
                <div>
                  <Label htmlFor="type-name">Name</Label>
                  <Input id="type-name" required placeholder="e.g. Deluxe" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="type-rate">Base rate</Label>
                  <Input id="type-rate" required type="number" placeholder="100" value={newTypeRate} onChange={(e) => setNewTypeRate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="type-base-occ">Base occupancy</Label>
                    <Input
                      id="type-base-occ"
                      required
                      type="number"
                      min={1}
                      value={newTypeBaseOccupancy}
                      onChange={(e) => setNewTypeBaseOccupancy(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="type-max-occ">Max occupancy</Label>
                    <Input
                      id="type-max-occ"
                      required
                      type="number"
                      min={1}
                      value={newTypeMaxOccupancy}
                      onChange={(e) => setNewTypeMaxOccupancy(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="type-amenities">Amenities</Label>
                  <AmenitiesEditor id="type-amenities" amenities={newTypeAmenities} onChange={setNewTypeAmenities} />
                </div>
                <Button type="submit">Add Room Type</Button>
              </form>
            </Card>
          )}

          {showAddRoom && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Plus className="h-4 w-4 text-brand-600" /> Add room
              </h2>
              <form onSubmit={handleCreateRoom} className="space-y-3">
                <div>
                  <Label htmlFor="room-type">Room type</Label>
                  <Select id="room-type" required value={newRoomTypeId} onChange={(e) => setNewRoomTypeId(e.target.value)}>
                    <option value="" disabled>Select room type</option>
                    {roomTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="room-number">Room number</Label>
                    <Input id="room-number" required placeholder="101" value={newRoomNumber} onChange={(e) => setNewRoomNumber(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="room-floor">Floor</Label>
                    <Input id="room-floor" placeholder="e.g. 1" value={newRoomFloor} onChange={(e) => setNewRoomFloor(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" disabled={roomTypes.length === 0}>Add Room</Button>
              </form>
            </Card>
          )}
        </div>
      )}

      <div>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : visibleRooms.length === 0 ? (
          <EmptyState
            icon={<Bed className="h-8 w-8" />}
            title={statusFilter || typeFilter || floorFilter ? 'No rooms match these filters' : 'No rooms yet'}
            description={statusFilter || typeFilter || floorFilter ? 'Try a different filter.' : 'Add a room type, then add rooms to it above.'}
          />
        ) : view === 'map' ? (
          <FloorMap rooms={visibleRooms} hotelId={hotelId} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Floor</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Rate</th>
                  <th className="px-5 py-3">Capacity</th>
                  <th className="px-5 py-3">Amenities</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-900">{r.roomNumber}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {editingFloorId === r.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={editFloorValue}
                            onChange={(e) => setEditFloorValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveFloor(r.id)}
                            className="h-7 w-16 px-2 py-1 text-xs"
                          />
                          <button onClick={() => saveFloor(r.id)} className="text-xs font-medium text-brand-700 hover:underline">Save</button>
                          <button onClick={() => setEditingFloorId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditFloor(r)} className="flex items-center gap-1.5 hover:text-brand-700">
                          {r.floor ?? '—'}
                          <Pencil className="h-3 w-3 text-slate-400" />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.roomType.name}</td>
                    <td className="px-5 py-3 text-slate-600">{r.roomType.baseRate}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {r.roomType.baseOccupancy}–{r.roomType.maxOccupancy} guests
                    </td>
                    <td className="px-5 py-3"><AmenitiesList amenities={r.roomType.amenities} /></td>
                    <td className="px-5 py-3">
                      {(() => {
                        const activeBlock = activeBlockByRoomId.get(r.id);
                        const reasonLabel = activeBlock ? BLOCK_REASONS.find((b) => b.value === activeBlock.reason)?.label ?? activeBlock.reason : undefined;
                        return (
                          <StatusBadge
                            status={activeBlock ? 'OUT_OF_ORDER' : r.status}
                            label={activeBlock ? `Blocked — ${reasonLabel}` : undefined}
                          />
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {r.status === 'OCCUPIED' && (
                          <>
                            <button
                              type="button"
                              title="Room charges"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const POPOVER_WIDTH = 288;
                                const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
                                setActiveChargeRoom({ room: r, anchor: { top: rect.bottom + 4, left } });
                              }}
                              className="flex items-center gap-1 text-slate-400 hover:text-brand-700"
                            >
                              <Receipt className="h-4 w-4" />
                            </button>
                            {serviceRequestedIds.has(r.id) ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600" title="Housekeeping has been notified">
                                <Check className="h-3.5 w-3.5" /> Requested
                              </span>
                            ) : (
                              <button
                                type="button"
                                title="Request room service"
                                onClick={() => handleRequestService(r)}
                                disabled={requestingServiceId === r.id}
                                className="flex items-center gap-1 text-slate-400 hover:text-brand-700 disabled:opacity-50"
                              >
                                <Sparkles className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                        {!activeBlockByRoomId.has(r.id) && (r.status === 'AVAILABLE' || r.status === 'DIRTY') && (
                          <button
                            type="button"
                            title="Block room (maintenance, renovation, etc.)"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const POPOVER_WIDTH = 256;
                              const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
                              setBlockRoomTarget({ room: r, anchor: { top: rect.bottom + 4, left } });
                            }}
                            className="flex items-center gap-1 text-slate-400 hover:text-rose-600"
                          >
                            <Wrench className="h-4 w-4" />
                          </button>
                        )}
                        {activeBlockByRoomId.has(r.id) && (
                          <button
                            type="button"
                            title="Edit block"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const POPOVER_WIDTH = 256;
                              const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16);
                              setEditBlockTarget({ block: activeBlockByRoomId.get(r.id)!, anchor: { top: rect.bottom + 4, left } });
                            }}
                            className="flex items-center gap-1 text-slate-400 hover:text-brand-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {blockRoomTarget && hotelId && (
        <BlockRoomPopover
          room={blockRoomTarget.room}
          hotelId={hotelId}
          today={todayInTimeZone(timezone)}
          anchor={blockRoomTarget.anchor}
          onClose={() => setBlockRoomTarget(null)}
          onDone={() => {
            setBlockRoomTarget(null);
            reload();
          }}
        />
      )}

      {editBlockTarget && hotelId && (
        <EditBlockPopover
          block={editBlockTarget.block}
          hotelId={hotelId}
          anchor={editBlockTarget.anchor}
          onClose={() => setEditBlockTarget(null)}
          onDone={() => {
            setEditBlockTarget(null);
            reload();
          }}
        />
      )}

      {activeChargeRoom && (
        <RoomChargesPopover
          room={activeChargeRoom.room}
          anchor={activeChargeRoom.anchor}
          onClose={() => setActiveChargeRoom(null)}
        />
      )}
    </div>
  );
}
