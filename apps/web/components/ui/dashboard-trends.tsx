'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/primitives';

interface TrendDay {
  date: string;
  revenue: number;
  occupancyPct: number;
}

interface TrendsResponse {
  days: TrendDay[];
  bookingSources: { source: string; count: number }[];
}

const SOURCE_LABELS: Record<string, string> = { DIRECT: 'Direct', PHONE: 'Phone', WALK_IN: 'Walk-in', OTA: 'OTA' };
// Fixed order + fixed hue per source (never re-colored by rank), validated
// CVD-safe as a set — see the dataviz skill's categorical palette.
const SOURCE_ORDER = ['DIRECT', 'PHONE', 'WALK_IN', 'OTA'];
const SOURCE_COLORS: Record<string, string> = { DIRECT: '#2a78d6', PHONE: '#eb6834', WALK_IN: '#1baf7a', OTA: '#eda100' };

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: { value: number }[]; label?: string; formatter: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-popover">
      <div className="font-medium text-slate-900">{label}</div>
      <div className="text-slate-500">{formatter(payload[0].value)}</div>
    </div>
  );
}

export function DashboardTrends({ hotelId }: { hotelId: string }) {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<TrendsResponse>(`/dashboard/trends?hotelId=${hotelId}&days=${rangeDays}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [hotelId, rangeDays]);

  const chartDays = (data?.days ?? []).map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const totalRevenue = chartDays.reduce((sum, d) => sum + d.revenue, 0);
  const avgOccupancy = chartDays.length ? Math.round(chartDays.reduce((sum, d) => sum + d.occupancyPct, 0) / chartDays.length) : 0;

  const sourceRows = SOURCE_ORDER.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    count: data?.bookingSources.find((s) => s.source === source)?.count ?? 0,
  })).filter((r) => r.count > 0);
  const totalBookings = sourceRows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card className="mt-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Trends</h2>
          <p className="text-xs text-slate-500">Revenue, occupancy, and booking sources over time.</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 text-xs">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                rangeDays === d ? 'bg-brand-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Revenue</span>
              <span className="text-sm font-semibold text-slate-900">{money(totalRevenue)}</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartDays} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2b4b96" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2b4b96" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e1e0d9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#898781' }}
                  axisLine={{ stroke: '#c3c2b7' }}
                  tickLine={false}
                  interval={rangeDays === 30 ? 4 : 0}
                />
                <YAxis width={34} tick={{ fontSize: 10, fill: '#898781' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip formatter={money} />} />
                <Area type="monotone" dataKey="revenue" stroke="#2b4b96" strokeWidth={2} fill="url(#dashboardRevenueFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Occupancy</span>
              <span className="text-sm font-semibold text-slate-900">{avgOccupancy}% avg</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartDays} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardOccupancyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c2932e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#c2932e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e1e0d9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#898781' }}
                  axisLine={{ stroke: '#c3c2b7' }}
                  tickLine={false}
                  interval={rangeDays === 30 ? 4 : 0}
                />
                <YAxis
                  width={34}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#898781' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                <Area type="monotone" dataKey="occupancyPct" stroke="#c2932e" strokeWidth={2} fill="url(#dashboardOccupancyFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Booking source</span>
              <span className="text-sm font-semibold text-slate-900">
                {totalBookings} booking{totalBookings === 1 ? '' : 's'}
              </span>
            </div>
            {sourceRows.length === 0 ? (
              <div className="flex h-[140px] items-center justify-center text-xs text-slate-400">No bookings in this window.</div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={sourceRows} layout="vertical" margin={{ top: 4, right: 28, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={52} tick={{ fontSize: 11, fill: '#52514e' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                    {sourceRows.map((r) => (
                      <Cell key={r.source} fill={SOURCE_COLORS[r.source]} />
                    ))}
                    <LabelList dataKey="count" position="right" style={{ fill: '#0b0b0b', fontSize: 11, fontWeight: 500 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
