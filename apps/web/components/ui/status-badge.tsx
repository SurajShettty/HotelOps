const STATUS_STYLES: Record<string, string> = {
  // booking statuses
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  CONFIRMED: 'bg-sky-50 text-sky-700 ring-sky-200',
  CHECKED_IN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CHECKED_OUT: 'bg-slate-100 text-slate-600 ring-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  NO_SHOW: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPLETED: 'bg-slate-100 text-slate-600 ring-slate-200',
  // room statuses
  AVAILABLE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OCCUPIED: 'bg-sky-50 text-sky-700 ring-sky-200',
  DIRTY: 'bg-amber-50 text-amber-700 ring-amber-200',
  OUT_OF_ORDER: 'bg-rose-50 text-rose-700 ring-rose-200',
  // housekeeping statuses
  IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200',
  INSPECTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  READY: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

function toLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {label ?? toLabel(status)}
    </span>
  );
}
