'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/primitives';

interface DayOccupancy {
  date: string;
  occupancyPct: number;
}

const WEEKS_SHOWN = 16;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Sequential single-hue ramp (light -> dark, steps 250/350/450/550/650 of the
// dataviz skill's blue ramp — validated `--ordinal` against the card surface,
// since the lighter 100/150/200 steps don't clear the 2:1 light-end floor).
// 0% is deliberately outside that ramp — a near-surface "empty" tone (not
// "very low but real") for a day with no bookings at all.
const EMPTY_COLOR = '#f1f5f9';
const BUCKETS: { max: number; color: string }[] = [
  { max: 0, color: EMPTY_COLOR },
  { max: 20, color: '#86b6ef' },
  { max: 40, color: '#5598e7' },
  { max: 60, color: '#2a78d6' },
  { max: 80, color: '#1c5cab' },
  { max: 100, color: '#104281' },
];

function bucketColor(pct: number) {
  return (BUCKETS.find((b) => pct <= b.max) ?? BUCKETS[BUCKETS.length - 1]).color;
}

// Server sends "YYYY-MM-DD" derived from UTC day boundaries — read it back
// via UTC getters too, so day-of-week/month don't shift with the viewer's
// own timezone.
function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function formatTooltipDate(iso: string) {
  return utcDate(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function OccupancyHeatmap({ hotelId }: { hotelId: string }) {
  const [days, setDays] = useState<DayOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<{ day: DayOccupancy; x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ days: DayOccupancy[] }>(`/dashboard/trends?hotelId=${hotelId}&days=${WEEKS_SHOWN * 7}`)
      .then((res) => setDays(res.days))
      .finally(() => setLoading(false));
  }, [hotelId]);

  // Pad the front so column 0 always starts on Sunday, keeping every week a
  // clean 7-cell column (GitHub-contributions layout).
  const cells: (DayOccupancy | null)[] = [];
  if (days.length > 0) {
    const leadingBlanks = utcDate(days[0].date).getUTCDay();
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    cells.push(...days);
  }
  const weeks: (DayOccupancy | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const avgOccupancy = days.length ? Math.round(days.reduce((sum, d) => sum + d.occupancyPct, 0) / days.length) : 0;

  function handleEnter(e: React.MouseEvent, day: DayOccupancy) {
    const gridRect = gridRef.current?.getBoundingClientRect();
    const cellRect = e.currentTarget.getBoundingClientRect();
    if (!gridRect) return;
    setHovered({ day, x: cellRect.left - gridRect.left + cellRect.width / 2, y: cellRect.top - gridRect.top });
  }

  let lastMonth = -1;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Occupancy heatmap</h2>
          <p className="text-xs text-slate-500">Last {WEEKS_SHOWN} weeks, {avgOccupancy}% average.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span>Less</span>
          {BUCKETS.map((b) => (
            <span key={b.max} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
          ))}
          <span>More</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-slate-400">Not enough data yet.</p>
      ) : (
        <div ref={gridRef} className="relative overflow-x-auto pb-1">
          <div className="flex gap-1.5">
            <div className="flex shrink-0 flex-col gap-1.5 pr-1">
              {/* Matches the h-3.5 month-label row atop each week column, so day labels line up with their actual cells below. */}
              <span className="block h-3.5" aria-hidden="true" />
              {DAY_LABELS.map((label, i) => (
                <span key={i} className="flex h-6 w-6 items-center text-[10px] text-slate-400">
                  {label}
                </span>
              ))}
            </div>
            {weeks.map((week, wi) => {
              const firstCell = week.find((c): c is DayOccupancy => c !== null);
              const month = firstCell ? utcDate(firstCell.date).getUTCMonth() : -1;
              const showMonth = firstCell !== undefined && month !== lastMonth;
              if (showMonth) lastMonth = month;
              return (
                <div key={wi} className="flex flex-col gap-1.5">
                  <span className="block h-3.5 text-[10px] text-slate-400">{showMonth ? MONTH_LABELS[month] : ''}</span>
                  {week.map((day, di) =>
                    day ? (
                      <button
                        key={di}
                        type="button"
                        onMouseEnter={(e) => handleEnter(e, day)}
                        onMouseLeave={() => setHovered(null)}
                        className="h-6 w-6 shrink-0 rounded-sm ring-1 ring-inset ring-black/5 transition-transform hover:scale-125"
                        style={{ backgroundColor: bucketColor(day.occupancyPct) }}
                      />
                    ) : (
                      <span key={di} className="h-6 w-6 shrink-0" />
                    ),
                  )}
                </div>
              );
            })}
          </div>

          {hovered && (
            <div
              style={{ left: hovered.x, top: hovered.y }}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-2"
            >
              <div className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-popover">
                <div className="font-medium text-slate-900">{hovered.day.occupancyPct}% occupied</div>
                <div className="text-slate-500">{formatTooltipDate(hovered.day.date)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
