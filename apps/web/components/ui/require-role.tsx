'use client';

import { ShieldAlert } from 'lucide-react';
import { useCurrentHotel } from '@/lib/hotel-context';
import { hasAnyRole, roleAtHotel, useRoleGrants } from '@/lib/roles';
import { EmptyState } from './primitives';

/**
 * Hides a whole page from roles the API already rejects (see the matching
 * @Roles(...) on the controller) — without this, the page still renders
 * (its GET calls are open to everyone) and only the mutating action fails,
 * which looks like a bug rather than a permission boundary.
 */
export function RequireRole({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const { hotelId } = useCurrentHotel();
  const grants = useRoleGrants();
  const role = roleAtHotel(grants, hotelId);

  // Grants haven't loaded yet — avoid a flash of "denied" before we know.
  if (grants === null) return null;

  if (!hasAnyRole(role, allowed)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="You don't have access to this page"
        description="Contact a hotel manager if you think this is a mistake."
      />
    );
  }

  return <>{children}</>;
}
