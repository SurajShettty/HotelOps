'use client';

import { useEffect, useState } from 'react';
import { Bell, Building2, Check, ChevronDown, ClipboardList, ImageOff, Percent, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Users, UserRound } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { AmenitiesEditor, AmenitiesList, toAmenitiesList } from '@/components/ui/amenities';
import { RequireRole } from '@/components/ui/require-role';
import { NON_HOUSEKEEPING_ROLES } from '@/lib/roles';

interface Hotel {
  id: string;
  name: string;
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
  earlyCheckInFee: string;
  lateCheckOutFee: string;
  logoUrl: string | null;
  housekeepingAutoAssignEnabled: boolean;
}

/** Small pill toggle — this codebase otherwise only has plain checkboxes, but "switch" reads better for a hotel-wide feature flag. */
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand-800' : 'bg-slate-200'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

/**
 * Shared shell for every settings section: header (icon/title/subtitle) is
 * always visible and toggles the body — open state is owned by SettingsPage
 * (one key, not per-card) so opening one section folds whichever was open.
 * Data fetching inside each card still runs regardless of isOpen (they stay
 * mounted, just don't render their body), so expanding never has to wait on
 * a fresh request.
 */
function AccordionSection({
  icon: Icon,
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex w-full items-center gap-2 p-5 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{title}</div>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="border-t border-slate-100 p-5 pt-4">{children}</div>}
    </Card>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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

function HotelProfileCard({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { hotelId } = useCurrentHotel();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [earlyCheckInFee, setEarlyCheckInFee] = useState('');
  const [lateCheckOutFee, setLateCheckOutFee] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
      setLogoUrl(h.logoUrl);
    });
  }, [hotelId]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Logo must be a PNG or JPEG image');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

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
          logoUrl,
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

  return (
    <AccordionSection
      icon={Building2}
      title="Hotel Profile"
      subtitle="Name, timezone, and check-in/check-out policy times for this property."
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {!hotel ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
      <form onSubmit={handleSave} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div>
          <Label htmlFor="hotel-logo">Logo</Label>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Hotel logo" className="h-full w-full object-contain" />
              ) : (
                <ImageOff className="h-5 w-5 text-slate-300" />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {logoUrl ? 'Replace logo' : 'Upload logo'}
                <input id="hotel-logo" type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} className="hidden" />
              </label>
              {logoUrl && (
                <button type="button" onClick={() => setLogoUrl(null)} className="text-left text-xs text-slate-400 hover:text-rose-600">
                  Remove logo
                </button>
              )}
              <p className="text-xs text-slate-400">PNG or JPEG, up to 2MB. Appears on invoices.</p>
            </div>
          </div>
        </div>
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
      )}
    </AccordionSection>
  );
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

interface FloorAssignment {
  id: string;
  floor: string;
  userId: string;
  user: { id: string; fullName: string };
}

interface HousekeepingStaff {
  id: string;
  fullName: string;
  roles: { role: string }[];
}

function HousekeepingRosterCard({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { hotelId } = useCurrentHotel();
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [togglingAutoAssign, setTogglingAutoAssign] = useState(false);
  const [floors, setFloors] = useState<string[]>([]);
  const [staff, setStaff] = useState<HousekeepingStaff[]>([]);
  const [assignments, setAssignments] = useState<FloorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFloor, setSavingFloor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    Promise.all([
      apiFetch<Hotel>(`/hotels/${hotelId}`),
      apiFetch<{ floor: string | null }[]>(`/rooms?hotelId=${hotelId}`),
      apiFetch<HousekeepingStaff[]>(`/users?hotelId=${hotelId}`),
      apiFetch<FloorAssignment[]>(`/housekeeping/floor-assignments?hotelId=${hotelId}`),
    ])
      .then(([hotel, rooms, users, roster]) => {
        setAutoAssignEnabled(hotel.housekeepingAutoAssignEnabled);
        setFloors(
          Array.from(new Set(rooms.map((r) => r.floor).filter((f): f is string => !!f))).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
          ),
        );
        setStaff(users.filter((u) => u.roles.some((r) => r.role === 'HOUSEKEEPING')));
        setAssignments(roster);
      })
      .catch(() => setError('Failed to load housekeeping roster'))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [hotelId]);

  async function toggleAutoAssign(next: boolean) {
    if (!hotelId) return;
    setTogglingAutoAssign(true);
    setError(null);
    try {
      await apiFetch(`/hotels/${hotelId}`, { method: 'PATCH', body: JSON.stringify({ housekeepingAutoAssignEnabled: next }) });
      setAutoAssignEnabled(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update setting');
    } finally {
      setTogglingAutoAssign(false);
    }
  }

  async function assignFloor(floor: string, userId: string) {
    if (!hotelId) return;
    setSavingFloor(floor);
    setError(null);
    try {
      const existing = assignments.find((a) => a.floor === floor);
      if (!userId) {
        if (existing) await apiFetch(`/housekeeping/floor-assignments/${existing.id}?hotelId=${hotelId}`, { method: 'DELETE' });
      } else {
        await apiFetch('/housekeeping/floor-assignments', { method: 'POST', body: JSON.stringify({ hotelId, floor, userId }) });
      }
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update assignment');
    } finally {
      setSavingFloor(null);
    }
  }

  return (
    <AccordionSection
      icon={ClipboardList}
      title="Housekeeping Assignment"
      subtitle="Assign one housekeeping staff member per floor."
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {error && <div className="mb-3"><ErrorBanner>{error}</ErrorBanner></div>}

      <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Auto-assign on checkout</p>
          <p className="text-xs text-slate-500">
            When on, a room's housekeeping task is assigned automatically to that floor's staff below as soon as it goes dirty.
          </p>
        </div>
        <Switch checked={autoAssignEnabled} onChange={toggleAutoAssign} disabled={togglingAutoAssign} />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-slate-400">No staff with the Housekeeping role yet — add one under Users &amp; Roles.</p>
      ) : floors.length === 0 ? (
        <p className="text-sm text-slate-400">No rooms have a floor set yet — add floors from the Rooms page.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {floors.map((floor) => {
            const current = assignments.find((a) => a.floor === floor);
            const assignedStaff = current ? staff.find((s) => s.id === current.userId) ?? null : null;
            return (
              <li key={floor} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                    {floor}
                  </span>
                  <span className="text-sm font-medium text-slate-900">Floor {floor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      assignedStaff ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {assignedStaff ? initials(assignedStaff.fullName) : <UserRound className="h-3.5 w-3.5" />}
                  </div>
                  <div className="relative">
                    <select
                      value={current?.userId ?? ''}
                      onChange={(e) => assignFloor(floor, e.target.value)}
                      disabled={savingFloor === floor}
                      className={`w-44 cursor-pointer appearance-none truncate rounded-full border py-1.5 pl-3 pr-8 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                        assignedStaff
                          ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                          : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.fullName}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccordionSection>
  );
}

function RoomTypesCard({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
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
    <AccordionSection icon={ShieldCheck} title="Room Types" subtitle="Rename or reprice existing room types." isOpen={isOpen} onToggle={onToggle}>
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
    </AccordionSection>
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

function PricingRulesCard({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
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
    <AccordionSection
      icon={Percent}
      title="Pricing Rules"
      subtitle="Seasonal, weekend, and dynamic rate adjustments on top of a room type's base rate."
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="mb-3 flex justify-end">
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
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium tabular-nums text-brand-700">{ruleAdjustmentLabel(rule)}</span>
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
                <span className="tabular-nums text-slate-500">{money(quote.baseRate)} base</span>
                {quote.appliedRules.length > 0 && (
                  <>
                    <span className="mx-1.5 text-slate-300">→</span>
                    <span className="tabular-nums font-medium text-brand-800">{money(quote.adjustedRate)}</span>
                    <span className="ml-1 text-xs text-slate-400">({quote.appliedRules.map((r) => r.name).join(', ')})</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </AccordionSection>
  );
}

const UNAVAILABLE_SECTIONS = [
  { name: 'Notifications', icon: Bell, note: 'No email/SMS/WhatsApp delivery is wired up yet.' },
];

const ROLE_OPTIONS = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING', 'FINANCE'] as const;
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Owner',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  HOUSEKEEPING: 'Housekeeping',
  FINANCE: 'Finance',
};

interface RoleGrant {
  grantId: string;
  role: string;
  hotelWide: boolean;
}

interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  roles: RoleGrant[];
}

function emptyUserForm() {
  return { email: '', fullName: '', phone: '', password: '', role: 'RECEPTIONIST' as string };
}

function UsersRolesCard({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { hotelId } = useCurrentHotel();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyUserForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addRoleFor, setAddRoleFor] = useState<string | null>(null);
  const [addRoleValue, setAddRoleValue] = useState<string>('RECEPTIONIST');

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<StaffUser[]>(`/users?hotelId=${hotelId}`)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [hotelId]);

  function closeForm() {
    setFormOpen(false);
    setForm(emptyUserForm());
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          hotelId,
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          role: form.role,
        }),
      });
      closeForm();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRole(userId: string) {
    if (!hotelId) return;
    try {
      await apiFetch(`/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ hotelId, role: addRoleValue }) });
      setAddRoleFor(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add role');
    }
  }

  async function handleRevokeRole(grantId: string) {
    if (!hotelId) return;
    try {
      await apiFetch(`/users/roles/${grantId}?hotelId=${hotelId}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove role');
    }
  }

  async function handleToggleActive(user: StaffUser) {
    if (!hotelId) return;
    try {
      await apiFetch(`/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ hotelId, isActive: !user.isActive }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user');
    }
  }

  return (
    <AccordionSection
      icon={Users}
      title="Users & Roles"
      subtitle="Staff accounts and what they can do at this property."
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="mb-3 flex justify-end">
        {!formOpen && (
          <Button variant="secondary" onClick={() => setFormOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> Add user
          </Button>
        )}
      </div>

      {error && <div className="mb-3"><ErrorBanner>{error}</ErrorBanner></div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="user-name">Full name</Label>
              <Input id="user-name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="user-phone">Phone (optional)</Label>
              <Input id="user-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="user-password">Temporary password</Label>
              <Input id="user-password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="user-role">Role</Label>
              <Select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-400">Share this password with them directly — there's no email invite flow yet.</p>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</Button>
            <button type="button" onClick={closeForm} className="text-sm text-slate-400 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-400">No staff accounts yet — add one above.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {users.map((user) => (
            <li key={user.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className={`min-w-0 flex-1 ${user.isActive ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{user.fullName}</span>
                    {!user.isActive && <span className="shrink-0 text-xs text-slate-400">Deactivated</span>}
                  </div>
                  <p className="truncate text-xs text-slate-500">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
                </div>
                <button onClick={() => handleToggleActive(user)} className="shrink-0 px-2 py-1 text-xs text-slate-400 hover:text-brand-700">
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {user.roles.map((grant) => (
                  <span key={grant.grantId} className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {ROLE_LABELS[grant.role] ?? grant.role}
                    {grant.hotelWide && <ShieldCheck className="h-3 w-3" />}
                    {!grant.hotelWide && (
                      <button onClick={() => handleRevokeRole(grant.grantId)} className="text-brand-400 hover:text-rose-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {addRoleFor === user.id ? (
                  <span className="flex items-center gap-1">
                    <Select value={addRoleValue} onChange={(e) => setAddRoleValue(e.target.value)} className="h-6 w-32 py-0 text-xs">
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </Select>
                    <button onClick={() => handleAddRole(user.id)} className="text-brand-700 hover:underline">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setAddRoleFor(null)} className="text-slate-400 hover:text-slate-700">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setAddRoleFor(user.id); setAddRoleValue('RECEPTIONIST'); }}
                    className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-slate-400 hover:text-brand-700"
                  >
                    <Plus className="h-3 w-3" /> Add role
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccordionSection>
  );
}

type SectionKey = 'profile' | 'roomTypes' | 'pricing' | 'housekeeping' | 'users';

export default function SettingsPage() {
  const { hotelId, ready } = useCurrentHotel();
  // Accordion: one key, not per-card state — opening a section always folds
  // whichever was open, per how this page is meant to behave.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

  function toggle(key: SectionKey) {
    setOpenSection((cur) => (cur === key ? null : key));
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <RequireRole allowed={NON_HOUSEKEEPING_ROLES}>
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure this property." />
      {/* Single column, deliberately: these cards' content ranges from a two-field
          form to an open-ended list, so a 2-col grid left uneven gaps wherever a
          short card sat beside a tall one — a stack sidesteps that entirely,
          and groups Rooms+Pricing (rates) before Housekeeping+Users (staff). */}
      <div className="space-y-3">
        <HotelProfileCard isOpen={openSection === 'profile'} onToggle={() => toggle('profile')} />
        <RoomTypesCard isOpen={openSection === 'roomTypes'} onToggle={() => toggle('roomTypes')} />
        <PricingRulesCard isOpen={openSection === 'pricing'} onToggle={() => toggle('pricing')} />
        <HousekeepingRosterCard isOpen={openSection === 'housekeeping'} onToggle={() => toggle('housekeeping')} />
        <UsersRolesCard isOpen={openSection === 'users'} onToggle={() => toggle('users')} />
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
    </RequireRole>
  );
}
