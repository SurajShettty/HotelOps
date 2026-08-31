'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Input, Label } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { GuestLoyaltyBadge, GuestLoyaltyTier } from '@/components/ui/guest-loyalty-badge';
import { GuestFlagBadge } from '@/components/ui/guest-flag-badge';

interface Booking {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
}

interface GuestDetail {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  bookings: Booking[];
  bookingsCount: number;
  loyaltyBadge: { tier: GuestLoyaltyTier; label: string } | null;
  isFlagged: boolean;
  flagReason: string | null;
  flaggedAt: string | null;
  flaggedBy: { fullName: string } | null;
}

export default function GuestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);

  useEffect(() => {
    apiFetch<GuestDetail>(`/guests/${params.id}`)
      .then((g) => {
        setGuest(g);
        setNotes(g.notes ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load guest'))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSaveNotes() {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<GuestDetail>(`/guests/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
      setGuest((prev) => (prev ? { ...prev, notes: updated.notes } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  }

  async function handleFlag() {
    if (!flagReason.trim()) return;
    setFlagging(true);
    setError(null);
    try {
      const updated = await apiFetch<GuestDetail>(`/guests/${params.id}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason: flagReason.trim() }),
      });
      setGuest(updated);
      setFlagReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to flag guest');
    } finally {
      setFlagging(false);
    }
  }

  async function handleUnflag() {
    if (!confirm('Remove this flag?')) return;
    setFlagging(true);
    setError(null);
    try {
      const updated = await apiFetch<GuestDetail>(`/guests/${params.id}/unflag`, { method: 'POST' });
      setGuest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove flag');
    } finally {
      setFlagging(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (error && !guest) return <div><ErrorBanner>{error}</ErrorBanner></div>;
  if (!guest) return null;

  return (
    <div>
      <button onClick={() => router.push('/guests')} className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to guests
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700">
          {guest.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{guest.fullName}</h1>
            <GuestLoyaltyBadge badge={guest.loyaltyBadge} />
            <GuestFlagBadge isFlagged={guest.isFlagged} flagReason={guest.flagReason} />
          </div>
          <p className="text-sm text-slate-500">{guest.email ?? 'No email'} · {guest.phone ?? 'No phone'}</p>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Stay history</h2>
          {guest.bookings.length === 0 ? (
            <p className="text-sm text-slate-400">No bookings yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Check-in</th>
                  <th className="py-2 pr-3">Check-out</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guest.bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 text-slate-600">{b.checkInDate.slice(0, 10)}</td>
                    <td className="py-2 pr-3 text-slate-600">{b.checkOutDate.slice(0, 10)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Notes</h2>
          <Label htmlFor="notes">Staff-visible notes</Label>
          <textarea
            id="notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <Button onClick={handleSaveNotes} disabled={saving} className="mt-3">
            {saving ? 'Saving…' : 'Save notes'}
          </Button>
        </Card>

        <Card className="p-5 md:col-span-3">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> Flag
          </h2>
          {guest.isFlagged ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">{guest.flagReason}</p>
              <p className="text-xs text-slate-400">
                Flagged {guest.flaggedAt ? new Date(guest.flaggedAt).toLocaleDateString() : ''}
                {guest.flaggedBy ? ` by ${guest.flaggedBy.fullName}` : ''}
              </p>
              <Button onClick={handleUnflag} disabled={flagging} variant="secondary">
                {flagging ? 'Removing…' : 'Remove flag'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[16rem]">
                <Label htmlFor="flag-reason">Reason (misbehavior, etc.)</Label>
                <Input
                  id="flag-reason"
                  placeholder="e.g. Property damage on last stay"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={handleFlag}
                disabled={flagging || !flagReason.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                {flagging ? 'Flagging…' : 'Flag guest'}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
