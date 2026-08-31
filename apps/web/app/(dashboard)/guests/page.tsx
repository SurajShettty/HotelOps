'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Button, Card, EmptyState, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';

const PAGE_SIZE = 10;

interface Guest {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export default function GuestsPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function reload() {
    if (!hotelId) return;
    setLoading(true);
    const params = new URLSearchParams({ hotelId, page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    apiFetch<{ items: Guest[]; total: number }>(`/guests?${params.toString()}`)
      .then((res) => {
        setGuests(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId, search, page]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/guests', {
        method: 'POST',
        body: JSON.stringify({ hotelId, fullName, email: email || undefined, phone: phone || undefined }),
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create guest');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader
        title="Guests"
        subtitle="Guest directory and stay history."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Guest'}
          </Button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      <Card className="mb-4 p-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search name, email, or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="guest-email">Email</Label>
              <Input id="guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="guest-phone">Phone</Label>
              <Input id="guest-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={submitting}>{submitting ? 'Adding…' : 'Add Guest'}</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : guests.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={search ? 'No guests match your search' : 'No guests yet'}
          description={search ? 'Try a different search term.' : "Add a guest, or they'll be created automatically when you make a booking."}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {guests.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/guests/${g.id}`} className="font-medium text-brand-700 hover:underline">
                      {g.fullName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{g.email ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{g.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
