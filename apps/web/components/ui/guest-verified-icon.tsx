'use client';

import { ShieldCheck } from 'lucide-react';

/**
 * Green when the guest's ID has been verified, grey and clickable (to open a
 * verify flow) when it hasn't — used on the Bookings tab next to a guest's
 * name. Kept separate from GuestBadges (loyalty/flag), which hides itself
 * entirely when nothing applies — this icon is meant to always be visible as
 * a persistent status + action, not just shown when there's something to say.
 */
export function GuestVerifiedIcon({
  verifiedAt,
  onClick,
}: {
  verifiedAt: string | null;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (verifiedAt) {
    return (
      <span title={`ID verified on ${verifiedAt.slice(0, 10)}`} className="inline-flex shrink-0 items-center text-emerald-600">
        <ShieldCheck className="h-4 w-4" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="ID not verified — click to verify"
      className="inline-flex shrink-0 items-center text-slate-300 hover:text-slate-500"
    >
      <ShieldCheck className="h-4 w-4" />
    </button>
  );
}
