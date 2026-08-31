'use client';

import { useEffect, useState } from 'react';
import { Bell, Building2, Check, Percent, Pencil, ShieldCheck, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';

interface Hotel {
  id: string;
  name: string;
  timezone: string;
}

interface RoomType {
  id: string;
  name: string;
  baseRate: string;
  baseOccupancy: number;
  maxOccupancy: number;
}

function HotelProfileCard() {
  const { hotelId } = useCurrentHotel();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<Hotel>(`/hotels/${hotelId}`).then((h) => {
      setHotel(h);
      setName(h.name);
      setTimezone(h.timezone);
    });
  }, [hotelId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Hotel>(`/hotels/${hotelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, timezone }),
      });
      setHotel(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!hotel) return null;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Building2 className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-slate-900">Hotel Profile</div>
          <p className="text-sm text-slate-500">Name and timezone for this property.</p>
        </div>
      </div>
      <form onSubmit={handleSave} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div>
          <Label htmlFor="hotel-name">Name</Label>
          <Input id="hotel-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hotel-timezone">Timezone</Label>
          <Input id="hotel-timezone" required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <Button type="submit" disabled={saving}>
          {saved ? <><Check className="h-4 w-4" /> Saved</> : saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Card>
  );
}

function RoomTypesCard() {
  const { hotelId } = useCurrentHotel();
  const [types, setTypes] = useState<RoomType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editBaseOccupancy, setEditBaseOccupancy] = useState('');
  const [editMaxOccupancy, setEditMaxOccupancy] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!hotelId) return;
    apiFetch<RoomType[]>(`/room-types?hotelId=${hotelId}`).then(setTypes);
  }

  useEffect(reload, [hotelId]);

  function startEdit(t: RoomType) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditRate(t.baseRate);
    setEditBaseOccupancy(String(t.baseOccupancy));
    setEditMaxOccupancy(String(t.maxOccupancy));
  }

  async function saveEdit(id: string) {
    if (!hotelId) return;
    setError(null);
    try {
      await apiFetch(`/room-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          hotelId,
          name: editName,
          baseRate: Number(editRate),
          baseOccupancy: Number(editBaseOccupancy),
          maxOccupancy: Number(editMaxOccupancy),
        }),
      });
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-slate-900">Room Types</div>
          <p className="text-sm text-slate-500">Rename or reprice existing room types.</p>
        </div>
      </div>
      {error && <div className="mb-3"><ErrorBanner>{error}</ErrorBanner></div>}
      {types.length === 0 ? (
        <p className="text-sm text-slate-400">No room types yet — add one from the Rooms page.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {types.map((t) => (
            <li key={t.id} className="py-2">
              {editingId === t.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-[10rem]" placeholder="Name" />
                    <Input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="max-w-[6rem]" placeholder="Rate" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={editBaseOccupancy}
                      onChange={(e) => setEditBaseOccupancy(e.target.value)}
                      className="max-w-[6rem]"
                      placeholder="Base occ."
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <Input
                      type="number"
                      min={1}
                      value={editMaxOccupancy}
                      onChange={(e) => setEditMaxOccupancy(e.target.value)}
                      className="max-w-[6rem]"
                      placeholder="Max occ."
                    />
                    <Button onClick={() => saveEdit(t.id)} className="px-3 py-1.5 text-xs">Save</Button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium text-slate-900">{t.name}</span>
                  <span className="text-sm text-slate-500">{t.baseRate}/night</span>
                  <span className="text-sm text-slate-500">{t.baseOccupancy}–{t.maxOccupancy} guests</span>
                  <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-brand-700">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const UNAVAILABLE_SECTIONS = [
  { name: 'Pricing Rules', icon: Percent, note: 'Seasonal/weekend/dynamic pricing needs a pricing-rules model in the schema — not built yet.' },
  { name: 'Users & Roles', icon: Users, note: 'Role assignment exists in the database (UserHotelRole), but there’s no API/UI to manage it yet.' },
  { name: 'Notifications', icon: Bell, note: 'No email/SMS/WhatsApp delivery is wired up yet.' },
];

export default function SettingsPage() {
  const { hotelId, ready } = useCurrentHotel();

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure this property." />
      <div className="grid gap-4 md:grid-cols-2">
        <HotelProfileCard />
        <RoomTypesCard />
        {UNAVAILABLE_SECTIONS.map(({ name, icon: Icon, note }) => (
          <Card key={name} className="flex items-start gap-3 p-5 opacity-60">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium text-slate-900">{name}</div>
              <p className="mt-0.5 text-sm text-slate-500">{note}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
