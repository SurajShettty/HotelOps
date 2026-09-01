'use client';

import { useEffect, useState } from 'react';
import { Bell, Building2, Check, Percent, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { AmenitiesEditor, AmenitiesList, toAmenitiesList } from '@/components/ui/amenities';

interface Hotel {
  id: string;
  name: string;
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
  earlyCheckInFee: string;
  lateCheckOutFee: string;
}

interface RoomType {
  id: string;
  name: string;
  baseRate: string;
  baseOccupancy: number;
  maxOccupancy: number;
  amenities: unknown;
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function HotelProfileCard() {
  const { hotelId } = useCurrentHotel();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [earlyCheckInFee, setEarlyCheckInFee] = useState('');
  const [lateCheckOutFee, setLateCheckOutFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<Hotel>(`/hotels/${hotelId}`).then((h) => {
      setHotel(h);
      setName(h.name);
      setTimezone(h.timezone);
      setCheckInTime(h.checkInTime);
      setCheckOutTime(h.checkOutTime);
      setEarlyCheckInFee(String(Number(h.earlyCheckInFee)));
      setLateCheckOutFee(String(Number(h.lateCheckOutFee)));
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
        body: JSON.stringify({
          name,
          timezone,
          checkInTime,
          checkOutTime,
          earlyCheckInFee: Number(earlyCheckInFee || 0),
          lateCheckOutFee: Number(lateCheckOutFee || 0),
        }),
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
          <p className="text-sm text-slate-500">Name, timezone, and check-in/check-out policy times for this property.</p>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="hotel-checkin-time">Check-in from</Label>
            <Input id="hotel-checkin-time" required type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hotel-checkout-time">Check-out by</Label>
            <Input id="hotel-checkout-time" required type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="hotel-early-fee">Early check-in fee</Label>
            <Input
              id="hotel-early-fee"
              type="number"
              min={0}
              step="any"
              placeholder="0"
              value={earlyCheckInFee}
              onChange={(e) => setEarlyCheckInFee(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="hotel-late-fee">Late check-out fee</Label>
            <Input
              id="hotel-late-fee"
              type="number"
              min={0}
              step="any"
              placeholder="0"
              value={lateCheckOutFee}
              onChange={(e) => setLateCheckOutFee(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Charged automatically when check-in/checkout happens before/after the times above — front desk can waive it per guest. Leave at 0 to disable.
        </p>
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
  const [editAmenities, setEditAmenities] = useState<string[]>([]);
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
    setEditAmenities(toAmenitiesList(t.amenities));
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
          amenities: editAmenities,
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
                  <AmenitiesEditor amenities={editAmenities} onChange={setEditAmenities} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-medium text-slate-900">{t.name}</span>
                    <span className="text-sm text-slate-500">{t.baseRate}/night</span>
                    <span className="text-sm text-slate-500">{t.baseOccupancy}–{t.maxOccupancy} guests</span>
                    <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-brand-700">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <AmenitiesList amenities={t.amenities} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface PricingRule {
  id: string;
  name: string;
  roomTypeId: string | null;
  roomType: { id: string; name: string } | null;
  adjustmentType: 'PERCENTAGE' | 'FIXED';
  adjustmentValue: string;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: number[];
  active: boolean;
  priority: number;
}

interface PricingQuote {
  baseRate: number;
  adjustedRate: number;
  appliedRules: { id: string; name: string; adjustmentType: 'PERCENTAGE' | 'FIXED'; adjustmentValue: number; resultingRate: number }[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function emptyRuleForm() {
  return {
    name: '',
    roomTypeId: '',
    adjustmentType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    adjustmentValue: '',
    startDate: '',
    endDate: '',
    daysOfWeek: [] as number[],
    priority: '0',
    active: true,
  };
}

type RuleForm = ReturnType<typeof emptyRuleForm>;

function ruleScopeLabel(rule: PricingRule) {
  return rule.roomType?.name ?? 'All room types';
}

function ruleWhenLabel(rule: PricingRule) {
  const parts: string[] = [];
  if (rule.startDate && rule.endDate) {
    parts.push(`${rule.startDate.slice(0, 10)} → ${rule.endDate.slice(0, 10)}`);
  }
  if (rule.daysOfWeek.length > 0) {
    parts.push(rule.daysOfWeek.map((d) => DAY_LABELS[d]).join(', '));
  }
  return parts.length > 0 ? parts.join(' · ') : 'Every night';
}

function ruleAdjustmentLabel(rule: PricingRule) {
  const value = Number(rule.adjustmentValue);
  const sign = value >= 0 ? '+' : '';
  return rule.adjustmentType === 'PERCENTAGE' ? `${sign}${value}%` : `${sign}${money(value)}`;
}

function PricingRulesCard() {
  const { hotelId } = useCurrentHotel();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quoteRoomTypeId, setQuoteRoomTypeId] = useState('');
  const [quoteDate, setQuoteDate] = useState('');
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    Promise.all([apiFetch<RoomType[]>(`/room-types?hotelId=${hotelId}`), apiFetch<PricingRule[]>(`/pricing-rules?hotelId=${hotelId}`)])
      .then(([rt, pr]) => {
        setRoomTypes(rt);
        setRules(pr);
        setQuoteRoomTypeId((prev) => prev || rt[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }

  useEffect(reload, [hotelId]);

  useEffect(() => {
    if (!hotelId || !quoteRoomTypeId || !quoteDate) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    const timer = setTimeout(() => {
      apiFetch<PricingQuote>(`/pricing-rules/quote?hotelId=${hotelId}&roomTypeId=${quoteRoomTypeId}&date=${quoteDate}`)
        .then(setQuote)
        .catch(() => setQuote(null))
        .finally(() => setQuoteLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [hotelId, quoteRoomTypeId, quoteDate]);

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyRuleForm());
    setError(null);
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyRuleForm());
    setFormOpen(true);
    setError(null);
  }

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      roomTypeId: rule.roomTypeId ?? '',
      adjustmentType: rule.adjustmentType,
      adjustmentValue: String(Number(rule.adjustmentValue)),
      startDate: rule.startDate?.slice(0, 10) ?? '',
      endDate: rule.endDate?.slice(0, 10) ?? '',
      daysOfWeek: rule.daysOfWeek,
      priority: String(rule.priority),
      active: rule.active,
    });
    setFormOpen(true);
    setError(null);
  }

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day) ? f.daysOfWeek.filter((d) => d !== day) : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setSaving(true);
    setError(null);
    const body = {
      hotelId,
      name: form.name,
      roomTypeId: form.roomTypeId || null,
      adjustmentType: form.adjustmentType,
      adjustmentValue: Number(form.adjustmentValue),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      daysOfWeek: form.daysOfWeek,
      priority: Number(form.priority || 0),
      active: form.active,
    };
    try {
      if (editingId) {
        await apiFetch(`/pricing-rules/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/pricing-rules', { method: 'POST', body: JSON.stringify(body) });
      }
      closeForm();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(rule: PricingRule) {
    if (!hotelId) return;
    try {
      await apiFetch(`/pricing-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ hotelId, active: !rule.active }) });
      reload();
    } catch {
      // Non-fatal — the list below still reflects the server's true state on next reload.
    }
  }

  async function handleDelete(id: string) {
    if (!hotelId) return;
    try {
      await apiFetch(`/pricing-rules/${id}?hotelId=${hotelId}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete rule');
    }
  }

  return (
    <Card className="p-5 md:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Percent className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-slate-900">Pricing Rules</div>
            <p className="text-sm text-slate-500">Seasonal, weekend, and dynamic rate adjustments on top of a room type's base rate.</p>
          </div>
        </div>
        {!formOpen && (
          <Button variant="secondary" onClick={startAdd} className="shrink-0">
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        )}
      </div>

      {error && <div className="mb-3"><ErrorBanner>{error}</ErrorBanner></div>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" required placeholder="e.g. Weekend surcharge" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rule-room-type">Applies to</Label>
              <Select id="rule-room-type" value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}>
                <option value="">All room types</option>
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rule-adjustment-type">Adjustment</Label>
              <Select
                id="rule-adjustment-type"
                value={form.adjustmentType}
                onChange={(e) => setForm({ ...form, adjustmentType: e.target.value as RuleForm['adjustmentType'] })}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-adjustment-value">
                Value {form.adjustmentType === 'PERCENTAGE' ? '(%, negative to discount)' : '(±, negative to discount)'}
              </Label>
              <Input
                id="rule-adjustment-value"
                type="number"
                step="any"
                required
                value={form.adjustmentValue}
                onChange={(e) => setForm({ ...form, adjustmentValue: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rule-priority">Priority</Label>
              <Input id="rule-priority" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Date range (optional — leave both blank to apply year-round)</Label>
            <div className="flex items-center gap-2">
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <span className="text-xs text-slate-400">to</span>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Days of week (optional — leave empty to apply every night)</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, day) => {
                const selected = form.daysOfWeek.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selected ? 'bg-brand-800 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add rule'}</Button>
            <button type="button" onClick={closeForm} className="text-sm text-slate-400 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-slate-400">No pricing rules yet — add one to adjust rates for weekends, seasons, or specific room types.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className={`min-w-0 flex-1 ${rule.active ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">{rule.name}</span>
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{ruleAdjustmentLabel(rule)}</span>
                  {!rule.active && <span className="shrink-0 text-xs text-slate-400">Inactive</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{ruleScopeLabel(rule)} · {ruleWhenLabel(rule)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => handleToggleActive(rule)} className="px-2 py-1 text-xs text-slate-400 hover:text-brand-700">
                  {rule.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => startEdit(rule)} className="p-1.5 text-slate-400 hover:text-brand-700">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-slate-400 hover:text-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {roomTypes.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Sparkles className="h-3.5 w-3.5" /> Preview a rate
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="quote-room-type">Room type</Label>
              <Select id="quote-room-type" className="w-40" value={quoteRoomTypeId} onChange={(e) => setQuoteRoomTypeId(e.target.value)}>
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="quote-date">Date</Label>
              <Input id="quote-date" type="date" className="w-40" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </div>
            {quoteLoading ? (
              <p className="pb-2 text-sm text-slate-400">Calculating…</p>
            ) : quote ? (
              <div className="pb-1 text-sm">
                <span className="text-slate-500">{money(quote.baseRate)} base</span>
                {quote.appliedRules.length > 0 && (
                  <>
                    <span className="mx-1.5 text-slate-300">→</span>
                    <span className="font-medium text-brand-800">{money(quote.adjustedRate)}</span>
                    <span className="ml-1 text-xs text-slate-400">({quote.appliedRules.map((r) => r.name).join(', ')})</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

const UNAVAILABLE_SECTIONS = [
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
        <PricingRulesCard />
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
