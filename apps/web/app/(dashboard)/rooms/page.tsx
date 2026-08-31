'use client';

import { useEffect, useState } from 'react';
import { Bed, Plus } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { AmenitiesEditor, AmenitiesList } from '@/components/ui/amenities';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'DIRTY', label: 'Dirty' },
  { value: 'OUT_OF_ORDER', label: 'Out of order' },
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
  roomType: RoomType;
}

export default function RoomsPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeRate, setNewTypeRate] = useState('');
  const [newTypeBaseOccupancy, setNewTypeBaseOccupancy] = useState('2');
  const [newTypeMaxOccupancy, setNewTypeMaxOccupancy] = useState('3');
  const [newTypeAmenities, setNewTypeAmenities] = useState<string[]>([]);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomTypeId, setNewRoomTypeId] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

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
      .then(([types, roomsData]) => {
        setRoomTypes(types);
        setRooms(roomsData);
        if (!newRoomTypeId && types.length > 0) setNewRoomTypeId(types[0].id);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId, statusFilter, typeFilter]);

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
        body: JSON.stringify({ hotelId, roomTypeId: newRoomTypeId, roomNumber: newRoomNumber }),
      });
      setNewRoomNumber('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room');
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Rooms" subtitle="Room types and inventory for this property." />
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      <div className="grid gap-4 md:grid-cols-2">
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
            <div>
              <Label htmlFor="room-number">Room number</Label>
              <Input id="room-number" required placeholder="101" value={newRoomNumber} onChange={(e) => setNewRoomNumber(e.target.value)} />
            </div>
            <Button type="submit" disabled={roomTypes.length === 0}>Add Room</Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6 mb-4 flex flex-wrap items-center gap-3 p-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-44">
          <option value="">All room types</option>
          {roomTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </Card>

      <div>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={<Bed className="h-8 w-8" />}
            title={statusFilter || typeFilter ? 'No rooms match these filters' : 'No rooms yet'}
            description={statusFilter || typeFilter ? 'Try a different filter.' : 'Add a room type, then add rooms to it above.'}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Rate</th>
                  <th className="px-5 py-3">Capacity</th>
                  <th className="px-5 py-3">Amenities</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{r.roomNumber}</td>
                    <td className="px-5 py-3 text-slate-600">{r.roomType.name}</td>
                    <td className="px-5 py-3 text-slate-600">{r.roomType.baseRate}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {r.roomType.baseOccupancy}–{r.roomType.maxOccupancy} guests
                    </td>
                    <td className="px-5 py-3"><AmenitiesList amenities={r.roomType.amenities} /></td>
                    <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
