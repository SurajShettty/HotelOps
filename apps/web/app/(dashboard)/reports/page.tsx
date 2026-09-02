'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { FINANCE_AREA_ROLES, HOUSEKEEPING_AREA_ROLES, RECEPTIONIST_AREA_ROLES, hasAnyRole, roleAtHotel, useRoleGrants } from '@/lib/roles';
import { Card, EmptyState, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { GuestBadges, GuestBadgeInfo } from '@/components/ui/guest-badges';

type ReportType = 'occupancy' | 'revenue' | 'bookings' | 'cancellations' | 'housekeeping' | 'housekeeping-staff';

const PAGINATED_TYPES: ReportType[] = ['bookings', 'cancellations', 'housekeeping'];
const PAGE_SIZE = 25;

// Mirrors each report's @Roles(...) on ReportsController exactly, so a tab
// never shows for a role whose request would just 403.
const REPORT_TYPES: { key: ReportType; label: string; roles: string[] }[] = [
  { key: 'occupancy', label: 'Occupancy', roles: RECEPTIONIST_AREA_ROLES },
  { key: 'revenue', label: 'Revenue', roles: FINANCE_AREA_ROLES },
  { key: 'bookings', label: 'Bookings', roles: RECEPTIONIST_AREA_ROLES },
  { key: 'cancellations', label: 'Cancellations', roles: RECEPTIONIST_AREA_ROLES },
  { key: 'housekeeping', label: 'Housekeeping', roles: HOUSEKEEPING_AREA_ROLES },
  { key: 'housekeeping-staff', label: 'Housekeeping by Staff', roles: HOUSEKEEPING_AREA_ROLES },
];

// housekeeping-staff hits GET /reports/housekeeping/by-staff, not /reports/housekeeping-staff
const REPORT_PATHS: Partial<Record<ReportType, string>> = { 'housekeeping-staff': 'housekeeping/by-staff' };

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { hotelId, ready } = useCurrentHotel();
  const roleGrants = useRoleGrants();
  const myRole = roleAtHotel(roleGrants, hotelId);
  // null while grants haven't loaded yet — every tab is provisionally hidden
  // until we know which ones this role can actually request.
  const visibleTypes = roleGrants === null ? [] : REPORT_TYPES.filter((t) => hasAnyRole(myRole, t.roles));

  const [type, setType] = useState<ReportType>('occupancy');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once we know this role's visible tabs, make sure `type` actually points
  // at one — the hardcoded 'occupancy' default would 403 for e.g. a
  // HOUSEKEEPING-only user, whose first real tab is 'housekeeping'.
  useEffect(() => {
    if (roleGrants === null) return;
    if (!visibleTypes.some((t) => t.key === type) && visibleTypes.length > 0) {
      setType(visibleTypes[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleGrants, myRole]);

  useEffect(() => {
    if (!ready || !hotelId || roleGrants === null || !visibleTypes.some((t) => t.key === type)) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ hotelId, from, to });
    if (PAGINATED_TYPES.includes(type)) {
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
    }
    apiFetch(`/reports/${REPORT_PATHS[type] ?? type}?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hotelId, roleGrants, type, from, to, page]);

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;
  if (roleGrants !== null && visibleTypes.length === 0) {
    return <p className="text-sm text-slate-500">You don't have access to any reports.</p>;
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Occupancy, revenue, bookings, cancellations, and housekeeping." />

      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {visibleTypes.map((t) => (
            <button
              key={t.key}
              onClick={() => { setType(t.key); setData(null); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                type === t.key ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-end gap-3">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>

      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ReportBody type={type} data={data} page={page} onPageChange={setPage} />
      )}
    </div>
  );
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function ReportBody({
  type,
  data,
  page,
  onPageChange,
}: {
  type: ReportType;
  data: unknown;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (!data) return <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No data" />;

  if (type === 'occupancy') {
    const d = data as { totalRooms: number; bookedRoomNights: number };
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-sm text-slate-500">Total rooms</div><div className="mt-1 text-2xl font-semibold">{d.totalRooms}</div></Card>
        <Card className="p-5"><div className="text-sm text-slate-500">Booked room-nights</div><div className="mt-1 text-2xl font-semibold">{d.bookedRoomNights}</div></Card>
      </div>
    );
  }

  if (type === 'revenue') {
    const d = data as { invoiceCount: number; totalRevenue: string; totalTax: string };
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-sm text-slate-500">Invoices</div><div className="mt-1 text-2xl font-semibold">{d.invoiceCount}</div></Card>
        <Card className="p-5"><div className="text-sm text-slate-500">Total revenue</div><div className="mt-1 text-2xl font-semibold">{d.totalRevenue}</div></Card>
        <Card className="p-5"><div className="text-sm text-slate-500">Total tax</div><div className="mt-1 text-2xl font-semibold">{d.totalTax}</div></Card>
      </div>
    );
  }

  if (type === 'bookings' || type === 'cancellations') {
    const { items, total, pageSize } = data as Paginated<{
      id: string;
      status: string;
      checkInDate: string;
      checkOutDate: string;
      guest: { fullName: string } & GuestBadgeInfo;
    }>;
    if (items.length === 0) return <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No results in this range" />;
    return (
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Guest</th>
              <th className="px-5 py-3">Check-in</th>
              <th className="px-5 py-3">Check-out</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-slate-900">
                  <span className="flex items-center gap-1.5">
                    {r.guest.fullName}
                    <GuestBadges guest={r.guest} />
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600">{r.checkInDate.slice(0, 10)}</td>
                <td className="px-5 py-3 text-slate-600">{r.checkOutDate.slice(0, 10)}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      </Card>
    );
  }

  if (type === 'housekeeping-staff') {
    const rows = data as { staffId: string | null; staffName: string; totalTasks: number; completedTasks: number; avgCompletionMinutes: number | null }[];
    if (rows.length === 0) return <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No results in this range" />;
    return (
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Staff</th>
              <th className="px-5 py-3">Total tasks</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3">Avg. completion time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.staffId ?? 'unassigned'}>
                <td className={`px-5 py-3 font-medium ${r.staffId ? 'text-slate-900' : 'text-slate-400'}`}>{r.staffName}</td>
                <td className="px-5 py-3 text-slate-600">{r.totalTasks}</td>
                <td className="px-5 py-3 text-slate-600">{r.completedTasks}</td>
                <td className="px-5 py-3 text-slate-600">
                  {r.avgCompletionMinutes === null ? '—' : `${Math.floor(r.avgCompletionMinutes / 60)}h ${r.avgCompletionMinutes % 60}m`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    );
  }

  // housekeeping
  const { items, total, pageSize } = data as Paginated<{ id: string; status: string; createdAt: string; room: { roomNumber: string }; assignedTo: { fullName: string } | null }>;
  if (items.length === 0) return <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No results in this range" />;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Room</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Assigned to</th>
            <th className="px-5 py-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 font-medium text-slate-900">{r.room.roomNumber}</td>
              <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-5 py-3 text-slate-600">{r.assignedTo?.fullName ?? '—'}</td>
              <td className="px-5 py-3 text-slate-600">{r.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
    </Card>
  );
}
