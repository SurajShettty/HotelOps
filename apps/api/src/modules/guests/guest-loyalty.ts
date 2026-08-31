import { Prisma } from '@hotelops/database';

export type GuestLoyaltyTier = 'RETURNING' | 'FREQUENT' | 'VIP';

/** Booking statuses that represent a stay the guest actually followed through on. */
export const COUNTED_BOOKING_STATUSES: Prisma.BookingWhereInput['status'] = {
  notIn: ['DRAFT', 'CANCELLED', 'NO_SHOW'],
};

const TIERS: Array<{ tier: GuestLoyaltyTier; minBookings: number; label: string }> = [
  { tier: 'VIP', minBookings: 10, label: 'VIP' },
  { tier: 'FREQUENT', minBookings: 5, label: 'Frequent Guest' },
  { tier: 'RETURNING', minBookings: 2, label: 'Returning Guest' },
];

/** Guests below the lowest tier get no badge — they don't have a stay history worth flagging yet. */
export function getGuestLoyaltyTier(bookingsCount: number): { tier: GuestLoyaltyTier; label: string } | null {
  return TIERS.find((t) => bookingsCount >= t.minBookings) ?? null;
}

/** Prisma `include` fragment for a `guest` relation, adding the count needed to derive its loyalty tier. */
export const GUEST_LOYALTY_INCLUDE = {
  _count: { select: { bookings: { where: { status: COUNTED_BOOKING_STATUSES } } } },
} satisfies Prisma.GuestInclude;

/**
 * Attaches `loyaltyBadge` to a nested `guest` relation fetched with
 * `GUEST_LOYALTY_INCLUDE`, so any endpoint that returns a booking/task with
 * its guest can surface the same badge guests.tsx and the guest picker show.
 */
export function withGuestLoyaltyBadge<T extends { guest: { _count: { bookings: number } } & Record<string, unknown> }>(
  record: T,
): Omit<T, 'guest'> & { guest: Omit<T['guest'], '_count'> & { loyaltyBadge: ReturnType<typeof getGuestLoyaltyTier> } } {
  const { guest, ...rest } = record;
  const { _count, ...guestRest } = guest;
  return { ...rest, guest: { ...guestRest, loyaltyBadge: getGuestLoyaltyTier(_count.bookings) } } as never;
}
