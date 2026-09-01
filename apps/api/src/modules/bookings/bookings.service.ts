import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../rooms/availability.service';
import { normalizePagination } from '../../common/pagination';
import { GUEST_LOYALTY_INCLUDE, withGuestLoyaltyBadge } from '../guests/guest-loyalty';
import { BookingRoomInput, CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';

const ACTIVE_STATUSES_BLOCKING_CANCEL = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];
const EDITABLE_STATUSES = ['DRAFT', 'CONFIRMED'];

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /** Rejects any room assignment whose occupant count exceeds that room type's max occupancy. */
  private assertWithinCapacity(
    roomInputs: BookingRoomInput[],
    rooms: { id: string; roomNumber: string; roomType: { maxOccupancy: number } }[],
  ) {
    for (const input of roomInputs) {
      const room = rooms.find((r) => r.id === input.roomId);
      const occupants = input.occupants ?? 1;
      if (room && occupants > room.roomType.maxOccupancy) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: `Room ${room.roomNumber} sleeps a maximum of ${room.roomType.maxOccupancy}, but ${occupants} occupant(s) were requested.`,
        });
      }
    }
  }

  async create(dto: CreateBookingDto, createdById: string) {
    const checkIn = new Date(dto.checkInDate);
    const checkOut = new Date(dto.checkOutDate);
    if (checkOut <= checkIn) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'checkOutDate must be after checkInDate' });
    }

    return this.prisma.$transaction(async (tx) => {
      const roomIds = dto.rooms.map((r) => r.roomId);

      const rooms = await tx.room.findMany({ where: { id: { in: roomIds }, hotelId: dto.hotelId }, include: { roomType: true } });
      if (rooms.length !== roomIds.length) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'One or more rooms do not belong to this hotel' });
      }
      this.assertWithinCapacity(dto.rooms, rooms);

      await this.availabilityService.assertRoomsAvailable(tx, { roomIds, checkIn, checkOut });

      const booking = await tx.booking.create({
        data: {
          hotelId: dto.hotelId,
          guestId: dto.guestId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          source: dto.source,
          status: 'CONFIRMED',
          createdById,
          bookingRooms: {
            create: dto.rooms.map((r) => ({ roomId: r.roomId, rateApplied: r.rate, occupants: r.occupants ?? 1 })),
          },
        },
        include: { bookingRooms: true },
      });

      return booking;
    });
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        bookingRooms: { include: { room: true } },
        guest: { include: GUEST_LOYALTY_INCLUDE },
        payments: true,
        invoice: true,
      },
    });
    return withGuestLoyaltyBadge(booking);
  }

  async findAllForHotel(
    hotelId: string,
    opts: {
      status?: string;
      search?: string;
      from?: string;
      to?: string;
      arrivingOn?: string;
      departingOn?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const { page, pageSize, skip, take } = normalizePagination(opts.page, opts.pageSize);

    const where: Prisma.BookingWhereInput = {
      hotelId,
      ...(opts.status ? { status: opts.status as never } : {}),
      ...(opts.search ? { guest: { fullName: { contains: opts.search, mode: 'insensitive' } } } : {}),
      ...(opts.from ? { checkInDate: { gte: new Date(opts.from) } } : {}),
      ...(opts.to ? { checkOutDate: { lte: new Date(opts.to) } } : {}),
      // Exact-day matches (as opposed to from/to, which bound a range) — used
      // by the "arriving/departing today" quick filters.
      ...(opts.arrivingOn ? { checkInDate: new Date(opts.arrivingOn) } : {}),
      ...(opts.departingOn ? { checkOutDate: new Date(opts.departingOn) } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        include: { bookingRooms: { include: { room: true } }, guest: { include: GUEST_LOYALTY_INCLUDE } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items: items.map(withGuestLoyaltyBadge), total, page, pageSize };
  }

  async update(id: string, dto: UpdateBookingDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id }, include: { bookingRooms: true } });
      if (!existing) throw new NotFoundException('Booking not found');
      if (existing.hotelId !== dto.hotelId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Booking does not belong to this hotel' });
      }
      if (!EDITABLE_STATUSES.includes(existing.status)) {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${existing.status} can no longer be edited` });
      }

      const checkIn = dto.checkInDate ? new Date(dto.checkInDate) : existing.checkInDate;
      const checkOut = dto.checkOutDate ? new Date(dto.checkOutDate) : existing.checkOutDate;
      if (checkOut <= checkIn) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'checkOutDate must be after checkInDate' });
      }

      const roomIds = dto.rooms ? dto.rooms.map((r) => r.roomId) : existing.bookingRooms.map((br) => br.roomId);
      if (dto.rooms) {
        const rooms = await tx.room.findMany({ where: { id: { in: roomIds }, hotelId: dto.hotelId }, include: { roomType: true } });
        if (rooms.length !== roomIds.length) {
          throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'One or more rooms do not belong to this hotel' });
        }
        this.assertWithinCapacity(dto.rooms, rooms);
      }

      await this.availabilityService.assertRoomsAvailable(tx, { roomIds, checkIn, checkOut, excludeBookingId: id });

      if (dto.rooms) {
        await tx.bookingRoom.deleteMany({ where: { bookingId: id } });
        await tx.bookingRoom.createMany({
          data: dto.rooms.map((r) => ({ bookingId: id, roomId: r.roomId, rateApplied: r.rate, occupants: r.occupants ?? 1 })),
        });
      }

      return tx.booking.update({
        where: { id },
        data: { checkInDate: checkIn, checkOutDate: checkOut },
        include: { bookingRooms: { include: { room: true } }, guest: true },
      });
    });
  }

  /**
   * If `roomIds` aren't free for [checkIn, checkOut) only because a
   * not-yet-arrived guest (status CONFIRMED, single-room booking) holds one
   * of them, try to bump that guest into another room of the same type for
   * their own stay instead of disturbing the guest who is already here.
   * Best-effort: leaves anything it can't resolve (a CHECKED_IN occupant, a
   * multi-room booking, no same-type room free, or a maintenance block) for
   * the subsequent assertRoomsAvailable call to report as usual.
   */
  private async relocateConflictingBookings(
    tx: Prisma.TransactionClient,
    params: { hotelId: string; roomIds: string[]; checkIn: Date; checkOut: Date; excludeBookingId: string },
  ) {
    const { hotelId, roomIds, checkIn, checkOut, excludeBookingId } = params;

    const conflicts = await tx.bookingRoom.findMany({
      where: {
        roomId: { in: roomIds },
        booking: {
          status: 'CONFIRMED',
          id: { not: excludeBookingId },
          checkInDate: { lt: checkOut },
          checkOutDate: { gt: checkIn },
        },
      },
      include: { booking: { include: { bookingRooms: true } }, room: true },
    });

    for (const conflict of conflicts) {
      if (conflict.booking.bookingRooms.length > 1) continue;

      const alternates = await this.availabilityService.findAvailableRooms(
        {
          hotelId,
          checkIn: conflict.booking.checkInDate,
          checkOut: conflict.booking.checkOutDate,
          roomTypeId: conflict.room.roomTypeId,
          excludeBookingId: conflict.booking.id,
        },
        tx,
      );
      const alternate = alternates.find((r) => !roomIds.includes(r.id));
      if (!alternate) continue;

      await tx.bookingRoom.update({ where: { id: conflict.id }, data: { roomId: alternate.id } });
    }
  }

  /**
   * A checked-in guest decides to stay longer. Extends checkOutDate, either
   * in the same room(s) or — if a `roomId` is given — moving a single-room
   * stay into a different room for the extended nights. The rate already
   * agreed for the stay is kept as-is; this doesn't re-price the booking,
   * it only relocates/prolongs it. Availability for the room is re-checked
   * for the *extension* window only ([old checkOutDate, new checkOutDate)),
   * not the whole stay, since the guest already legitimately holds the room
   * up to their original checkout date.
   */
  async extend(id: string, dto: ExtendBookingDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id }, include: { bookingRooms: true } });
      if (!existing) throw new NotFoundException('Booking not found');
      if (existing.hotelId !== dto.hotelId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Booking does not belong to this hotel' });
      }
      if (existing.status !== 'CHECKED_IN') {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking must be CHECKED_IN to extend, got ${existing.status}` });
      }

      const newCheckOut = new Date(dto.checkOutDate);
      if (newCheckOut <= existing.checkOutDate) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'New check-out date must be after the current check-out date' });
      }

      const isMove = !!dto.roomId && dto.roomId !== existing.bookingRooms[0]?.roomId;
      if (isMove && existing.bookingRooms.length > 1) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Moving rooms mid-stay is only supported for single-room bookings' });
      }

      const targetRoomIds = isMove ? [dto.roomId!] : existing.bookingRooms.map((br) => br.roomId);
      if (isMove) {
        const room = await tx.room.findUnique({ where: { id: dto.roomId! } });
        if (!room || room.hotelId !== dto.hotelId) {
          throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Room does not belong to this hotel' });
        }
      }

      if (!isMove) {
        await this.relocateConflictingBookings(tx, {
          hotelId: dto.hotelId,
          roomIds: targetRoomIds,
          checkIn: existing.checkOutDate,
          checkOut: newCheckOut,
          excludeBookingId: id,
        });
      }

      await this.availabilityService.assertRoomsAvailable(tx, {
        roomIds: targetRoomIds,
        checkIn: existing.checkOutDate,
        checkOut: newCheckOut,
        excludeBookingId: id,
      });

      if (isMove) {
        const oldRoomId = existing.bookingRooms[0].roomId;
        await tx.bookingRoom.update({ where: { id: existing.bookingRooms[0].id }, data: { roomId: dto.roomId! } });
        await tx.room.update({ where: { id: oldRoomId }, data: { status: 'DIRTY' } });
        await tx.housekeepingTask.create({ data: { roomId: oldRoomId, status: 'DIRTY', priority: 1 } });
        await tx.room.update({ where: { id: dto.roomId! }, data: { status: 'OCCUPIED' } });
      }

      return tx.booking.update({
        where: { id },
        data: { checkOutDate: newCheckOut },
        include: { bookingRooms: { include: { room: true } }, guest: true },
      });
    });
  }

  async cancel(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (ACTIVE_STATUSES_BLOCKING_CANCEL.includes(booking.status)) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${booking.status} cannot be cancelled` });
    }
    return this.prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // Only a CONFIRMED booking that never checked in can be marked a no-show —
  // once checked in, "didn't show up" no longer applies. Frees the room from
  // showing as reserved and stops it counting toward Dashboard's no-show
  // alert (see DashboardService.getNoShows).
  async noShow(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${booking.status} cannot be marked as no-show` });
    }
    return this.prisma.booking.update({ where: { id }, data: { status: 'NO_SHOW' } });
  }
}
