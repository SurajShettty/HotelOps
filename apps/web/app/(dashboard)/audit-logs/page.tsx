'use client';

import { Fragment, useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrentHotel } from '@/lib/hotel-context';
import { Card, EmptyState, ErrorBanner, Input, Label, PageHeader, Select } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';

const PAGE_SIZE = 25;

const ENTITIES = [
  'Booking', 'Guest', 'Room', 'RoomType', 'RoomBlock', 'PricingRule',
  'Hotel', 'UserHotelRole', 'RoomCharge', 'User', 'Payment', 'Invoice', 'HousekeepingTask',
];

// Mirrors AuditLogsService's revert dispatch table on the API — kept here so the
// Revert button only appears where the backend will actually accept it, instead
// of round-tripping to find out.
const REVERTIBLE = new Set([
  'Booking:CREATE', 'Booking:UPDATE', 'Booking:CANCEL', 'Booking:NO_SHOW',
  'Guest:CREATE', 'Guest:UPDATE', 'Guest:FLAG', 'Guest:UNFLAG',
  'Room:CREATE', 'Room:STATUS_CHANGE', 'Room:FLOOR_CHANGE',
  'RoomType:CREATE', 'RoomType:UPDATE',
  'RoomBlock:CREATE', 'RoomBlock:DELETE',
  'PricingRule:CREATE', 'PricingRule:UPDATE', 'PricingRule:DELETE',
  'Hotel:UPDATE',
  'UserHotelRole:ASSIGN', 'UserHotelRole:REVOKE',
  'RoomCharge:CREATE', 'RoomCharge:DELETE',
  'User:ACTIVATE', 'User:DEACTIVATE',
]);

interface AuditLogRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  diff: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
  createdAt: string;
  revertedAt: string | null;
  actor: { id: string; fullName: string } | null;
  revertedBy: { id: string; fullName: string } | null;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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

function DiffView({ diff }: { diff: AuditLogRow['diff'] }) {
  if (!diff || (!diff.before && !diff.after)) return <p className="text-xs text-slate-400">No details recorded.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div>
        <p className="mb-1 font-medium text-slate-500">Before</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-slate-600">{JSON.stringify(diff.before ?? {}, null, 2)}</pre>
      </div>
      <div>
        <p className="mb-1 font-medium text-slate-500">After</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-slate-600">{JSON.stringify(diff.after ?? {}, null, 2)}</pre>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const style =
    action === 'REVERT'
      ? 'bg-violet-50 text-violet-700 ring-violet-200'
      : action === 'CREATE' || action === 'ASSIGN' || action === 'ACTIVATE'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : action === 'DELETE' || action === 'CANCEL' || action === 'REVOKE' || action === 'DEACTIVATE' || action === 'NO_SHOW'
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : 'bg-sky-50 text-sky-700 ring-sky-200';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{action}</span>;
}

export default function AuditLogsPage() {
  const { hotelId, ready } = useCurrentHotel();
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AuditLogRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  function load() {
    if (!ready || !hotelId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ hotelId, from, to, page: String(page), pageSize: String(PAGE_SIZE) });
    if (entity) params.set('entity', entity);
    apiFetch<Paginated<AuditLogRow>>(`/audit-logs?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [ready, hotelId, entity, from, to, page]);

  async function handleRevert(row: AuditLogRow) {
    if (!hotelId) return;
    if (!confirm(`Revert this ${row.entity} ${row.action.toLowerCase()}?`)) return;
    setRevertingId(row.id);
    try {
      await apiFetch(`/audit-logs/${row.id}/revert?hotelId=${hotelId}`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revert');
    } finally {
      setRevertingId(null);
    }
  }

  if (!ready) return null;
  if (!hotelId) return <p className="text-sm text-slate-500">Create a hotel from the Dashboard first.</p>;

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Who changed what, and when — with the option to undo safe actions." />

      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label htmlFor="entity">Entity</Label>
          <Select id="entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-44">
            <option value="">All</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </Card>

      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<History className="h-8 w-8" />} title="No activity in this range" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Actor</th>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((row) => {
                const isRevertible = REVERTIBLE.has(`${row.entity}:${row.action}`) && !row.revertedAt;
                const isExpanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                      <td className="px-5 py-3 text-slate-500">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{row.actor?.fullName ?? 'System'}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {row.entity} <span className="text-xs text-slate-400">{row.entityId.slice(0, 8)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <ActionBadge action={row.action} />
                          {row.revertedAt && <span className="text-xs text-slate-400">reverted{row.revertedBy ? ` by ${row.revertedBy.fullName}` : ''}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isRevertible && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRevert(row); }}
                            disabled={revertingId === row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {revertingId === row.id ? 'Reverting…' : 'Revert'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50/50 px-5 py-3">
                          <DiffView diff={row.diff} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
