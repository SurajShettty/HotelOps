'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Download, DoorOpen, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch, ApiError, downloadFile } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { formatTime12h, todayInTimeZone } from '@/lib/format';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, Select } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/primitives';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';
import { RequireRole } from '@/components/ui/require-role';
import { RECEPTIONIST_AREA_ROLES } from '@/lib/roles';

interface Booking {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string } & GuestBadgeInfo;
  bookingRooms: { room: { id: string; roomNumber: string } }[];
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomType: { id: string; name: string };
}

interface LineItem {
  description: string;
  amount: string;
}

interface RoomCharge {
  id: string;
  description: string;
  amount: string;
  addedBy: { fullName: string };
}

interface Folio {
  nights: number;
  actualCheckOut: string;
  roomSubtotal: number;
  chargesTotal: number;
  discountTotal: number;
  lateCheckOutApplicable: boolean;
  lateCheckOutFee: number;
  lateCheckOutTime: string;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  grandTotal: number;
  alreadyPaid: number;
  balanceDue: number;
  refundDue: number;
}

function emptyLine(): LineItem {
  return { description: '', amount: '' };
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function FolioSummary({
  folio,
  loading,
  plannedCheckOut,
  waiveLateFee,
  onWaiveLateFeeChange,
}: {
  folio: Folio | null;
  loading: boolean;
  plannedCheckOut: string;
  waiveLateFee: boolean;
  onWaiveLateFeeChange: (v: boolean) => void;
}) {
  const departureChanged = folio && folio.actualCheckOut.slice(0, 10) !== plannedCheckOut.slice(0, 10);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      {!folio ? (
        <p className="text-slate-400">{loading ? 'Calculating…' : 'Add charges/discounts to see the total.'}</p>
      ) : (
        <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          {departureChanged && (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              Checking out today ({folio.actualCheckOut.slice(0, 10)}) instead of the booked date ({plannedCheckOut.slice(0, 10)}) — billed for the actual stay.
            </p>
          )}
          {folio.lateCheckOutApplicable && (
            <label className="mb-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              <input
                type="checkbox"
                checked={waiveLateFee}
                onChange={(e) => onWaiveLateFeeChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Checking out after {formatTime12h(folio.lateCheckOutTime)} — waive the late check-out fee?
            </label>
          )}
          <div className="flex justify-between py-0.5 text-slate-600">
            <span>Room ({folio.nights} night{folio.nights === 1 ? '' : 's'})</span>
            <span className="tabular-nums">{money(folio.roomSubtotal)}</span>
          </div>
          {folio.chargesTotal > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Additional charges</span>
              <span>+{money(folio.chargesTotal)}</span>
            </div>
          )}
          {folio.lateCheckOutFee > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Late check-out fee</span>
              <span>+{money(folio.lateCheckOutFee)}</span>
            </div>
          )}
          {folio.discountTotal > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Discounts</span>
              <span>-{money(folio.discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between py-0.5 text-slate-600">
            <span>Tax ({folio.taxRate}%)</span>
            <span>+{money(folio.taxTotal)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 font-medium text-slate-900">
            <span>Grand total</span>
            <span className="tabular-nums">{money(folio.grandTotal)}</span>
          </div>
          {folio.alreadyPaid > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Already paid</span>
              <span>-{money(folio.alreadyPaid)}</span>
            </div>
          )}
          {folio.refundDue > 0 ? (
            <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-amber-700">
              <span>Refund due to guest</span>
              <span className="tabular-nums">{money(folio.refundDue)}</span>
            </div>
          ) : (
            <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-brand-800">
              <span>Amount to be paid</span>
              <span className="tabular-nums">{money(folio.balanceDue)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FolioForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const { hotelId } = useCurrentHotel();
  const [charges, setCharges] = useState<LineItem[]>([]);
  const [discounts, setDiscounts] = useState<LineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAmountTouched, setPaymentAmountTouched] = useState(false);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [waiveLateFee, setWaiveLateFee] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; grandTotal: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Charges logged against this stay while it was in progress (see the Rooms
  // page's per-room "charges" popover) — fetched here so checkout doesn't
  // require re-typing what housekeeping/front desk already logged, and the
  // server folds these into the same total automatically.
  const [loggedCharges, setLoggedCharges] = useState<RoomCharge[]>([]);
  const [loggedChargesVersion, setLoggedChargesVersion] = useState(0);

  useEffect(() => {
    apiFetch<RoomCharge[]>(`/room-charges?bookingId=${booking.id}&hotelId=${hotelId}`)
      .then(setLoggedCharges)
      .catch(() => setLoggedCharges([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, loggedChargesVersion]);

  async function handleRemoveLoggedCharge(id: string) {
    try {
      await apiFetch(`/room-charges/${id}?hotelId=${hotelId}`, { method: 'DELETE' });
      setLoggedChargesVersion((v) => v + 1);
    } catch {
      // Non-fatal — the folio preview below still reflects the server's true state either way.
    }
  }

  function updateLine(list: LineItem[], setList: (v: LineItem[]) => void, i: number, field: keyof LineItem, value: string) {
    const next = [...list];
    next[i] = { ...next[i], [field]: value };
    setList(next);
  }

  // Recompute the live total (debounced) whenever charges/discounts/logged
  // charges change — the amount to be paid is calculated automatically, not
  // left for the receptionist to work out by hand.
  useEffect(() => {
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      apiFetch<Folio>(`/checkout/preview?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          additionalCharges: charges.filter((c) => c.description && c.amount).map((c) => ({ description: c.description, amount: Number(c.amount) })),
          discounts: discounts.filter((d) => d.description && d.amount).map((d) => ({ description: d.description, amount: Number(d.amount) })),
          waiveLateCheckOutFee: waiveLateFee,
        }),
      })
        .then((f) => {
          setFolio(f);
          if (!paymentAmountTouched) setPaymentAmount(String(f.balanceDue));
        })
        .catch(() => setFolio(null))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(charges), JSON.stringify(discounts), loggedChargesVersion, waiveLateFee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const invoice = await apiFetch<{ id: string; grandTotal: string }>(`/checkout?hotelId=${hotelId}`, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          additionalCharges: charges.filter((c) => c.description && c.amount).map((c) => ({ description: c.description, amount: Number(c.amount) })),
          discounts: discounts.filter((d) => d.description && d.amount).map((d) => ({ description: d.description, amount: Number(d.amount) })),
          paymentMethod,
          paymentAmount: Number(paymentAmount || 0),
          waiveLateCheckOutFee: waiveLateFee,
        }),
      });
      setResult(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadFile(`/invoices/${result.id}/pdf?hotelId=${hotelId}`, `invoice-${result.id.slice(0, 8)}.pdf`);
    } catch {
      setError('Failed to download invoice');
    } finally {
      setDownloading(false);
    }
  }

  if (result) {
    return (
      <Card className="p-5">
        <p className="text-sm font-medium text-emerald-700">Checked out — invoice total {result.grandTotal}</p>
        {error && <div className="mt-2"><ErrorBanner>{error}</ErrorBanner></div>}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={handleDownloadInvoice} disabled={downloading}>
            <Download className="h-4 w-4" />
            {downloading ? 'Downloading…' : 'Download Invoice PDF'}
          </Button>
          <Button variant="ghost" onClick={onDone}>Done</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {loggedCharges.length > 0 && (
          <div>
            <Label>Room charges logged during stay</Label>
            <ul className="mt-2 space-y-1.5 rounded-lg border border-slate-200 p-3">
              {loggedCharges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    {c.description} <span className="text-xs text-slate-400">— {c.addedBy.fullName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-slate-600">
                    {c.amount}
                    <button type="button" onClick={() => handleRemoveLoggedCharge(c.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Additional charges</Label>
            <button type="button" onClick={() => setCharges([...charges, emptyLine()])} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
              <Plus className="h-3 w-3" /> Add charge
            </button>
          </div>
          {charges.map((c, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input placeholder="Description" value={c.description} onChange={(e) => updateLine(charges, setCharges, i, 'description', e.target.value)} />
              <Input type="number" placeholder="Amount" className="w-32" value={c.amount} onChange={(e) => updateLine(charges, setCharges, i, 'amount', e.target.value)} />
              <button type="button" onClick={() => setCharges(charges.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Discounts</Label>
            <button type="button" onClick={() => setDiscounts([...discounts, emptyLine()])} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
              <Plus className="h-3 w-3" /> Add discount
            </button>
          </div>
          {discounts.map((d, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input placeholder="Description" value={d.description} onChange={(e) => updateLine(discounts, setDiscounts, i, 'description', e.target.value)} />
              <Input type="number" placeholder="Amount" className="w-32" value={d.amount} onChange={(e) => updateLine(discounts, setDiscounts, i, 'amount', e.target.value)} />
              <button type="button" onClick={() => setDiscounts(discounts.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <FolioSummary
          folio={folio}
          loading={previewLoading}
          plannedCheckOut={booking.checkOutDate}
          waiveLateFee={waiveLateFee}
          onWaiveLateFeeChange={setWaiveLateFee}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`method-${booking.id}`}>Payment method</Label>
            <Select id={`method-${booking.id}`} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`amount-${booking.id}`}>Payment amount</Label>
            <Input
              id={`amount-${booking.id}`}
              type="number"
              required
              value={paymentAmount}
              onChange={(e) => {
                setPaymentAmountTouched(true);
                setPaymentAmount(e.target.value);
              }}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Payment amount is pre-filled with the amount to be paid above — edit it for a partial payment.
        </p>

        <Button type="submit" disabled={submitting}>{submitting ? 'Processing…' : 'Complete Checkout'}</Button>
      </form>
    </Card>
  );
}

function addDaysIso(iso: string, n: number) {
  const d = new Date(iso.slice(0, 10));
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "Actually, can we stay another night?" — checks whether the guest's current
 * room is free for the extension window and, if not, offers whichever other
 * rooms are. Availability is only re-checked for [today's checkout date, new
 * checkout date) — the guest already legitimately holds the room up to today.
 */
function ExtendStayForm({ hotelId, booking, onDone, onCancel }: { hotelId: string; booking: Booking; onDone: () => void; onCancel: () => void }) {
  const currentRoom = booking.bookingRooms[0]?.room ?? null;
  const isMultiRoom = booking.bookingRooms.length > 1;

  const [newCheckOut, setNewCheckOut] = useState(addDaysIso(booking.checkOutDate, 1));
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [checking, setChecking] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once an in-place extend attempt comes back ROOM_UNAVAILABLE — i.e. the
  // server couldn't free up the current room by relocating an incoming
  // (not-yet-arrived) reservation into another same-type room either. Only
  // then do we fall back to asking the front desk to move this guest.
  const [autoRelocateFailed, setAutoRelocateFailed] = useState(false);

  useEffect(() => {
    setAutoRelocateFailed(false);
    if (!newCheckOut) {
      setAvailableRooms([]);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      apiFetch<{ availableRooms: AvailableRoom[] }>(
        `/rooms/availability?hotelId=${hotelId}&checkIn=${booking.checkOutDate.slice(0, 10)}&checkOut=${newCheckOut}&excludeBookingId=${booking.id}`,
      )
        .then((res) => {
          setAvailableRooms(res.availableRooms);
          setSelectedRoomId((prev) => (prev && res.availableRooms.some((r) => r.id === prev) ? prev : res.availableRooms[0]?.id ?? ''));
        })
        .catch(() => setAvailableRooms([]))
        .finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, booking.id, booking.checkOutDate, newCheckOut]);

  const sameRoomAvailable = !isMultiRoom && !!currentRoom && availableRooms.some((r) => r.id === currentRoom.id);
  const allCurrentRoomsAvailable = isMultiRoom && booking.bookingRooms.every((br) => availableRooms.some((r) => r.id === br.room.id));
  const otherRooms = availableRooms.filter((r) => r.id !== currentRoom?.id);

  async function handleExtend(roomId?: string) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${booking.id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ hotelId, checkOutDate: newCheckOut, ...(roomId ? { roomId } : {}) }),
      });
      onDone();
    } catch (err) {
      // Only give up on keeping the guest in place once the server has
      // actually tried and failed to bump the incoming reservation elsewhere.
      if (!roomId && err instanceof ApiError && err.code === 'ROOM_UNAVAILABLE') {
        setAutoRelocateFailed(true);
        setError(null);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Failed to extend stay');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}
      <div className="max-w-xs">
        <Label htmlFor={`extend-${booking.id}`}>New check-out date</Label>
        <Input
          id={`extend-${booking.id}`}
          type="date"
          min={addDaysIso(booking.checkOutDate, 1)}
          value={newCheckOut}
          onChange={(e) => setNewCheckOut(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {checking ? (
          <p className="text-sm text-slate-400">Checking availability…</p>
        ) : isMultiRoom ? (
          allCurrentRoomsAvailable ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-800">Both/all rooms are available through {newCheckOut}.</p>
              <Button onClick={() => handleExtend()} disabled={submitting}>{submitting ? 'Extending…' : 'Extend Stay'}</Button>
            </div>
          ) : !autoRelocateFailed ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Not all rooms are free through {newCheckOut} yet — one may be booked by an upcoming reservation. We'll try moving that
                reservation elsewhere first.
              </p>
              <Button onClick={() => handleExtend()} disabled={submitting} className="shrink-0">
                {submitting ? 'Trying…' : 'Extend Stay'}
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Couldn't free up all of this booking's rooms through {newCheckOut} automatically — multi-room moves aren't supported here; adjust the date or edit the booking manually.
            </p>
          )
        ) : sameRoomAvailable ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm text-emerald-800">Room {currentRoom?.roomNumber} is free through {newCheckOut} — no need to move.</p>
            <Button onClick={() => handleExtend()} disabled={submitting}>{submitting ? 'Extending…' : 'Extend Stay'}</Button>
          </div>
        ) : !autoRelocateFailed ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Room {currentRoom?.roomNumber} isn't free through {newCheckOut} — it's booked by an upcoming reservation. We'll try moving
              that reservation into another room of the same type so this guest doesn't have to move.
            </p>
            <Button onClick={() => handleExtend()} disabled={submitting} className="shrink-0">
              {submitting ? 'Trying…' : 'Extend Stay'}
            </Button>
          </div>
        ) : otherRooms.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Couldn't free up Room {currentRoom?.roomNumber} automatically — move this guest into another room instead:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {otherRooms.map((r) => {
                const selected = selectedRoomId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoomId(r.id)}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      selected
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-inset ring-brand-600'
                        : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                    }`}
                  >
                    <DoorOpen className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-brand-700' : 'text-slate-400'}`} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-medium ${selected ? 'text-brand-900' : 'text-slate-900'}`}>
                        Room {r.roomNumber}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.roomType.name}
                        {r.floor ? ` · Floor ${r.floor}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button onClick={() => handleExtend(selectedRoomId)} disabled={submitting || !selectedRoomId} className="w-full sm:w-auto">
              {submitting ? 'Moving…' : 'Move & Extend'}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            No rooms are available through {newCheckOut}. Try a different date.
          </p>
        )}
      </div>

      <button type="button" onClick={onCancel} className="mt-4 text-sm text-slate-400 hover:text-slate-700">
        Cancel
      </button>
    </Card>
  );
}

export default function CheckoutPage() {
  const { hotelId, ready, timezone } = useCurrentHotel();
  const [stays, setStays] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [dueAmounts, setDueAmounts] = useState<Record<string, number>>({});

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`)
      .then((res) => {
        const items = [...res.items].sort((a, b) => a.checkOutDate.localeCompare(b.checkOutDate));
        setStays(items);
        items.forEach((b) => {
          apiFetch<Folio>(`/checkout/preview?hotelId=${hotelId}`, {
            method: 'POST',
            body: JSON.stringify({ bookingId: b.id, additionalCharges: [], discounts: [], waiveLateCheckOutFee: false }),
          })
            .then((f) => setDueAmounts((prev) => ({ ...prev, [b.id]: f.balanceDue })))
            .catch(() => {});
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  useEffect(() => {
    if (!hotelId) return;
    apiFetch<{ checkOutTime: string }>(`/hotels/${hotelId}`)
      .then((h) => setCheckOutTime(h.checkOutTime))
      .catch(() => setCheckOutTime(null));
  }, [hotelId]);

  const visibleStays = roomSearch.trim()
    ? stays.filter((b) => b.bookingRooms.some((br) => br.room.roomNumber.toLowerCase().includes(roomSearch.trim().toLowerCase())))
    : stays;

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <RequireRole allowed={RECEPTIONIST_AREA_ROLES}>
    <div>
      <PageHeader
        title="Check-Out"
        subtitle={`Guests currently staying, ready to settle up.${checkOutTime ? ` Standard check-out by ${formatTime12h(checkOutTime)}.` : ''}`}
      />

      {stays.length > 0 && (
        <Card className="mb-4 p-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search room number…"
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : stays.length === 0 ? (
        <EmptyState icon={<DoorOpen className="h-8 w-8" />} title="No one to check out" description="Guests who are checked in will show up here." />
      ) : visibleStays.length === 0 ? (
        <EmptyState icon={<DoorOpen className="h-8 w-8" />} title="No matching room" description="Try a different room number." />
      ) : (
        <div className="space-y-3">
          {visibleStays.map((b) => {
            const departingToday = b.checkOutDate.slice(0, 10) === todayInTimeZone(timezone);
            return (
              <div key={b.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      {initials(b.guest.fullName)}
                    </span>
                    <div>
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {b.guest.fullName}
                      <GuestBadges guest={b.guest} />
                      {departingToday && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          Departing today
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {b.checkInDate.slice(0, 10)} → {b.checkOutDate.slice(0, 10)} · Room{' '}
                      {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {dueAmounts[b.id] !== undefined && activeId !== b.id && (
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Total payable</div>
                        <div className="text-sm font-semibold tabular-nums text-slate-900">{money(dueAmounts[b.id])}</div>
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActiveId(null);
                        setExtendingId(extendingId === b.id ? null : b.id);
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {extendingId === b.id ? 'Close' : 'Wants to stay longer?'}
                    </Button>
                    <Button
                      variant={activeId === b.id ? 'secondary' : 'primary'}
                      onClick={() => {
                        setExtendingId(null);
                        setActiveId(activeId === b.id ? null : b.id);
                      }}
                    >
                      {activeId === b.id ? 'Close' : 'Check Out'}
                    </Button>
                  </div>
                </Card>
                {extendingId === b.id && (
                  <div className="mt-2">
                    <ExtendStayForm
                      hotelId={hotelId}
                      booking={b}
                      onCancel={() => setExtendingId(null)}
                      onDone={() => { setExtendingId(null); reload(); }}
                    />
                  </div>
                )}
                {activeId === b.id && (
                  <div className="mt-2">
                    <FolioForm booking={b} onDone={() => { setActiveId(null); reload(); }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </RequireRole>
  );
}
