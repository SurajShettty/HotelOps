import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rooms in `hotelId` (optionally filtered by room type) with no overlapping
   * active booking and no overlapping room block for [checkIn, checkOut).
   */
  async findAvailableRooms(params: {
    hotelId: string;
    checkIn: Date;
    checkOut: Date;
    roomTypeId?: string;
    excludeBookingId?: string;
  }) {
    const { hotelId, checkIn, checkOut, roomTypeId, excludeBookingId } = params;

    return this.prisma.room.findMany({
      where: {
        hotelId,
        ...(roomTypeId ? { roomTypeId } : {}),
        status: { not: 'OUT_OF_ORDER' },
        bookingRooms: {
          none: {
            booking: {
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
              checkInDate: { lt: checkOut },
              checkOutDate: { gt: checkIn },
              ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            },
          },
        },
        roomBlocks: {
          none: {
            startDate: { lt: checkOut },
            endDate: { gt: checkIn },
          },
        },
      },
      include: { roomType: true },
    });
  }

  /**
   * Throws ConflictException if any of `roomIds` overlap an existing active
   * booking or block for the given date range. Must be called inside the
   * same transaction as the write that reserves the rooms. This check gives
   * a fast, friendly error; the actual race-proof guarantee against
   * concurrent double-booking is the Postgres EXCLUDE (gist) constraint in
   * packages/database/prisma/manual-sql/001_exclusion_constraints.sql,
   * which will abort the transaction even if two requests pass this check
   * simultaneously.
   */
  async assertRoomsAvailable(
    tx: Prisma.TransactionClient,
    params: { roomIds: string[]; checkIn: Date; checkOut: Date; excludeBookingId?: string },
  ) {
    const { roomIds, checkIn, checkOut, excludeBookingId } = params;

    const conflictingBookingRoom = await tx.bookingRoom.findFirst({
      where: {
        roomId: { in: roomIds },
        booking: {
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          checkInDate: { lt: checkOut },
          checkOutDate: { gt: checkIn },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
      },
    });
    if (conflictingBookingRoom) {
      throw new ConflictException({ code: 'ROOM_UNAVAILABLE', message: 'One or more rooms are already booked for the requested dates.' });
    }

    const conflictingBlock = await tx.roomBlock.findFirst({
      where: {
        roomId: { in: roomIds },
        startDate: { lt: checkOut },
        endDate: { gt: checkIn },
      },
    });
    if (conflictingBlock) {
      throw new ConflictException({ code: 'ROOM_UNAVAILABLE', message: 'One or more rooms are blocked for the requested dates.' });
    }
  }
}
