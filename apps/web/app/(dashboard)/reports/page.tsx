'use client';

import { useEffect, useState } from 'react';
import { BarChart3, BedDouble, FileText, Percent, Receipt, Wallet } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { HOUSEKEEPING_AREA_ROLES, NON_HOUSEKEEPING_ROLES, hasAnyRole, roleAtHotel, useRoleGrants } from '@/lib/roles';
import { Card, EmptyState, ErrorBanner, Input, Label, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';

// 'revenue' is the merged Revenue & Occupancy report — one tab, three
// underlying calls (occupancy + revenue + revenue/detailed), fetched
// together (see the effect below) since they share one role gate now.
type ReportType = 'revenue' | 'housekeeping-staff';

const PAGE_SIZE = 25;

// Mirrors each report's @Roles(...) on ReportsController exactly, so a tab
// never shows for a role whose request would just 403.
const REPORT_TYPES: { key: ReportType; label: string; roles: string[] }[] = [
  { key: 'revenue', label: 'Revenue & Occupancy', roles: NON_HOUSEKEEPING_ROLES },
  { key: 'housekeeping-staff', label: 'Housekeeping by Staff', roles: HOUSEKEEPING_AREA_ROLES },
];

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

  const [type, setType] = useState<ReportType>('revenue');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once we know this role's visible tabs, make sure `type` actually points
  // at one — the hardcoded 'revenue' default would 403 for e.g. a
  // HOUSEKEEPING-only user, whose first real tab is 'housekeeping-staff'.
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

    // The merged report needs three calls (occupancy + revenue KPIs, plus
    // the paginated room/guest detail table) combined into one shape —
    // everything else here is still a single GET /reports/<type>.
    const request =
      type === 'revenue'
        ? Promise.all([
            apiFetch(`/reports/occupancy?${new URLSearchParams({ hotelId, from, to })}`),
            apiFetch(`/reports/revenue?${new URLSearchParams({ hotelId, from, to })}`),
            apiFetch(
              `/reports/revenue/detailed?${new URLSearchParams({ hotelId, from, to, page: String(page), pageSize: String(PAGE_SIZE) })}`,
            ),
          ]).then(([occupancy, revenue, detailed]) => ({ occupancy, revenue, detailed }))
        : apiFetch(`/reports/housekeeping/by-staff?${new URLSearchParams({ hotelId, from, to })}`);

    request
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
      <PageHeader title="Reports" subtitle="Revenue, occupancy, and housekeeping by staff." />

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

  if (type === 'revenue') {
    const { occupancy, revenue, detailed } = data as {
      occupancy: { totalRooms: number; bookedRoomNights: number };
      revenue: { invoiceCount: number; totalRevenue: string; totalTax: string };
      detailed: Paginated<{
        invoiceId: string;
        issuedAt: string;
        guestName: string;
        roomNumbers: string[];
        nights: number;
        roomSubtotal: string;
        chargesTotal: string;
        discountTotal: string;
        taxTotal: string;
        grandTotal: string;
      }>;
    };
    const statCards: { key: string; label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tint: string }[] = [
      { key: 'rooms', label: 'Total rooms', value: occupancy.totalRooms, icon: BedDouble, tint: 'bg-brand-50 text-brand-700' },
      { key: 'roomNights', label: 'Booked room-nights', value: occupancy.bookedRoomNights, icon: BarChart3, tint: 'bg-sky-50 text-sky-700' },
      { key: 'invoices', label: 'Invoices', value: revenue.invoiceCount, icon: Receipt, tint: 'bg-violet-50 text-violet-700' },
      { key: 'revenue', label: 'Total revenue', value: revenue.totalRevenue, icon: Wallet, tint: 'bg-gold-50 text-gold-700' },
      { key: 'tax', label: 'Total tax', value: revenue.totalTax, icon: Percent, tint: 'bg-emerald-50 text-emerald-700' },
    ];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.key} className="p-4">
                <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${s.tint}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-3 text-[22px] font-bold tabular-nums tracking-tight text-slate-900">{s.value}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">{s.label}</div>
              </Card>
            );
          })}
        </div>

        {detailed.items.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No invoices in this range" />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-5 py-3">Room(s)</th>
                  <th className="px-5 py-3">Issued</th>
                  <th className="px-5 py-3">Nights</th>
                  <th className="px-5 py-3">Room revenue</th>
                  <th className="px-5 py-3">Charges</th>
                  <th className="px-5 py-3">Discount</th>
                  <th className="px-5 py-3">Tax</th>
                  <th className="px-5 py-3">Grand total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailed.items.map((r) => (
                  <tr key={r.invoiceId}>
                    <td className="px-5 py-3 font-medium text-slate-900">{r.guestName}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.roomNumbers.join(', ')}</td>
                    <td className="px-5 py-3 text-slate-600">{r.issuedAt.slice(0, 10)}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.nights}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.roomSubtotal}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.chargesTotal}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.discountTotal}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.taxTotal}</td>
                    <td className="px-5 py-3 tabular-nums font-medium text-slate-900">{r.grandTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={detailed.pageSize} total={detailed.total} onPageChange={onPageChange} />
          </Card>
        )}
      </div>
    );
  }

  // housekeeping-staff
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
              <td className="px-5 py-3 tabular-nums text-slate-600">{r.totalTasks}</td>
              <td className="px-5 py-3 tabular-nums text-slate-600">{r.completedTasks}</td>
              <td className="px-5 py-3 tabular-nums text-slate-600">
                {r.avgCompletionMinutes === null ? '—' : `${Math.floor(r.avgCompletionMinutes / 60)}h ${r.avgCompletionMinutes % 60}m`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
