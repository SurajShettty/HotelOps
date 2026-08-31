'use client';

import { useEffect, useState } from 'react';
import { DoorOpen, Plus, Trash2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, Select } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/primitives';

interface Booking {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { fullName: string };
  bookingRooms: { room: { roomNumber: string } }[];
}

interface LineItem {
  description: string;
  amount: string;
}

interface Folio {
  nights: number;
  actualCheckOut: string;
  roomSubtotal: number;
  chargesTotal: number;
  discountTotal: number;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  grandTotal: number;
  alreadyPaid: number;
  balanceDue: number;
}

function emptyLine(): LineItem {
  return { description: '', amount: '' };
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FolioSummary({ folio, loading, plannedCheckOut }: { folio: Folio | null; loading: boolean; plannedCheckOut: string }) {
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
          <div className="flex justify-between py-0.5 text-slate-600">
            <span>Room ({folio.nights} night{folio.nights === 1 ? '' : 's'})</span>
            <span>{money(folio.roomSubtotal)}</span>
          </div>
          {folio.chargesTotal > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Additional charges</span>
              <span>+{money(folio.chargesTotal)}</span>
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
            <span>{money(folio.grandTotal)}</span>
          </div>
          {folio.alreadyPaid > 0 && (
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Already paid</span>
              <span>-{money(folio.alreadyPaid)}</span>
            </div>
          )}
          <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-brand-800">
            <span>Amount to be paid</span>
            <span>{money(folio.balanceDue)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FolioForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const [charges, setCharges] = useState<LineItem[]>([]);
  const [discounts, setDiscounts] = useState<LineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAmountTouched, setPaymentAmountTouched] = useState(false);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ grandTotal: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(list: LineItem[], setList: (v: LineItem[]) => void, i: number, field: keyof LineItem, value: string) {
    const next = [...list];
    next[i] = { ...next[i], [field]: value };
    setList(next);
  }

  // Recompute the live total (debounced) whenever charges/discounts change —
  // the amount to be paid is calculated automatically, not left for the
  // receptionist to work out by hand.
  useEffect(() => {
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      apiFetch<Folio>('/checkout/preview', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          additionalCharges: charges.filter((c) => c.description && c.amount).map((c) => ({ description: c.description, amount: Number(c.amount) })),
          discounts: discounts.filter((d) => d.description && d.amount).map((d) => ({ description: d.description, amount: Number(d.amount) })),
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
  }, [JSON.stringify(charges), JSON.stringify(discounts)]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const invoice = await apiFetch<{ grandTotal: string }>('/checkout', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          additionalCharges: charges.filter((c) => c.description && c.amount).map((c) => ({ description: c.description, amount: Number(c.amount) })),
          discounts: discounts.filter((d) => d.description && d.amount).map((d) => ({ description: d.description, amount: Number(d.amount) })),
          paymentMethod,
          paymentAmount: Number(paymentAmount || 0),
        }),
      });
      setResult(invoice);
      setTimeout(onDone, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="p-5">
        <p className="text-sm font-medium text-emerald-700">Checked out — invoice total {result.grandTotal}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

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

        <FolioSummary folio={folio} loading={previewLoading} plannedCheckOut={booking.checkOutDate} />

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

export default function CheckoutPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [stays, setStays] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    apiFetch<{ items: Booking[] }>(`/bookings?hotelId=${hotelId}&status=CHECKED_IN&pageSize=200`)
      .then((res) => setStays(res.items))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId]);

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Check-Out" subtitle="Guests currently staying, ready to settle up." />

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : stays.length === 0 ? (
        <EmptyState icon={<DoorOpen className="h-8 w-8" />} title="No one to check out" description="Guests who are checked in will show up here." />
      ) : (
        <div className="space-y-3">
          {stays.map((b) => (
            <div key={b.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="font-medium text-slate-900">{b.guest.fullName}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {b.checkInDate.slice(0, 10)} → {b.checkOutDate.slice(0, 10)} · Room{' '}
                    {b.bookingRooms.map((br) => br.room.roomNumber).join(', ')}
                  </div>
                </div>
                <Button variant={activeId === b.id ? 'secondary' : 'primary'} onClick={() => setActiveId(activeId === b.id ? null : b.id)}>
                  {activeId === b.id ? 'Close' : 'Check Out'}
                </Button>
              </Card>
              {activeId === b.id && (
                <div className="mt-2">
                  <FolioForm booking={b} onDone={() => { setActiveId(null); reload(); }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
