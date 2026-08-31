import { Award, Star, Crown } from 'lucide-react';

export type GuestLoyaltyTier = 'RETURNING' | 'FREQUENT' | 'VIP';

const TIER_STYLES: Record<GuestLoyaltyTier, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  RETURNING: { className: 'bg-sky-50 text-sky-700 ring-sky-200', icon: Award },
  FREQUENT: { className: 'bg-violet-50 text-violet-700 ring-violet-200', icon: Star },
  VIP: { className: 'bg-amber-50 text-amber-700 ring-amber-200', icon: Crown },
};

export function GuestLoyaltyBadge({ badge }: { badge: { tier: GuestLoyaltyTier; label: string } | null }) {
  if (!badge) return null;
  const { className, icon: Icon } = TIER_STYLES[badge.tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}
