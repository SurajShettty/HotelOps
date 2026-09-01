'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { CalendarDays } from 'lucide-react';

function parseISO(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  disablePast = true,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  disablePast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseISO(checkIn),
    to: parseISO(checkOut),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  // react-day-picker's built-in range merge (addToRange) only replaces `from`
  // when you click exactly on the existing `from`/`to` day — once a *complete*
  // range is already selected (e.g. this component opened pre-filled), every
  // other click just moves `to`, so `from` can look permanently stuck. Rather
  // than trust its merged result, drive the two-click flow ourselves off the
  // actual clicked day (the handler's 2nd arg): the click that starts a fresh
  // range doesn't close the popover; the next click (completing it) does.
  const midSelectionRef = useRef(false);

  useEffect(() => {
    setRange({ from: parseISO(checkIn), to: parseISO(checkOut) });
  }, [checkIn, checkOut]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleSelect(_next: DateRange | undefined, clickedDay: Date) {
    if (!midSelectionRef.current) {
      // First click of a fresh selection — always anchor on the day actually
      // clicked, regardless of any pre-existing complete range.
      setRange({ from: clickedDay, to: clickedDay });
      onChange(formatISO(clickedDay), formatISO(clickedDay));
      midSelectionRef.current = true;
      return;
    }
    // Second click completes the range — order the two dates by click order.
    const anchor = range?.from ?? clickedDay;
    const from = clickedDay < anchor ? clickedDay : anchor;
    const to = clickedDay < anchor ? anchor : clickedDay;
    setRange({ from, to });
    onChange(formatISO(from), formatISO(to));
    midSelectionRef.current = false;
    setOpen(false);
  }

  function handleTriggerClick() {
    setOpen((v) => {
      const next = !v;
      if (next) midSelectionRef.current = false;
      return next;
    });
  }

  const label = range?.from
    ? range.to
      ? `${formatLabel(range.from)} → ${formatLabel(range.to)}`
      : `${formatLabel(range.from)} → …`
    : 'Select dates';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleTriggerClick}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
        <span className={range?.from ? '' : 'text-slate-400'}>{label}</span>
      </button>

      {open && (
        <div
          className="date-range-popover absolute left-0 top-full z-50 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-popover"
          style={
            {
              '--rdp-accent-color': '#1c2f5e',
              '--rdp-accent-background-color': '#eef2fb',
              '--rdp-day-height': '2.25rem',
              '--rdp-day-width': '2.25rem',
            } as React.CSSProperties
          }
        >
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
            defaultMonth={range?.from ?? new Date()}
            disabled={disablePast ? { before: startOfToday() } : undefined}
          />
        </div>
      )}
    </div>
  );
}
