import { AlertTriangle } from 'lucide-react';

export function GuestFlagBadge({ isFlagged, flagReason }: { isFlagged: boolean; flagReason?: string | null }) {
  if (!isFlagged) return null;
  return (
    <span
      title={flagReason ?? undefined}
      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
    >
      <AlertTriangle className="h-3 w-3" />
      Flagged
    </span>
  );
}
