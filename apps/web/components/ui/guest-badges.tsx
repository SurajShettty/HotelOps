import { GuestLoyaltyBadge, GuestLoyaltyTier } from './guest-loyalty-badge';
import { GuestFlagBadge } from './guest-flag-badge';

export interface GuestBadgeInfo {
  loyaltyBadge: { tier: GuestLoyaltyTier; label: string } | null;
  isFlagged: boolean;
  flagReason: string | null;
}

/** Loyalty + flag badges for a guest, wherever their name is shown. */
export function GuestBadges({ guest }: { guest: GuestBadgeInfo }) {
  if (!guest.loyaltyBadge && !guest.isFlagged) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <GuestLoyaltyBadge badge={guest.loyaltyBadge} />
      <GuestFlagBadge isFlagged={guest.isFlagged} flagReason={guest.flagReason} />
    </span>
  );
}
