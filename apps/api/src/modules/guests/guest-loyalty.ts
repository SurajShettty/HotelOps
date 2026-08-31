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
