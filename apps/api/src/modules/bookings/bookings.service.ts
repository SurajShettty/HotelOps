import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../rooms/availability.service';
import { normalizePagination } from '../../common/pagination';
import { todayUtcDateOnly } from '../../common/date.util';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { GUEST_LOYALTY_INCLUDE, withGuestLoyaltyBadge } from '../guests/guest-loyalty';
import { BookingRoomInput, CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';
import { ChangeRoomBookingDto } from './dto/change-room-booking.dto';

const ACTIVE_STATUSES_BLOCKING_CANCEL = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];
const EDITABLE_STATUSES = ['DRAFT', 'CONFIRMED'];

type RoomsSnapshot = { roomId: string; rate: number; occupants: number }[];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function roomsSnapshot(bookingRooms: { roomId: string; rateApplied: Prisma.Decimal | number; occupants: number }[]): RoomsSnapshot {
  return bookingRooms
    .map((br) => ({ roomId: br.roomId, rate: Number(br.rateApplied), occupants: br.occupants }))
    .sort((a, b) => a.roomId.localeCompare(b.roomId));
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly auditLog: AuditLogService,
    private readonly housekeepingService: HousekeepingService,
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

      await this.auditLog.record(tx, {
        hotelId: dto.hotelId,
        actorId: createdById,
        entity: 'Booking',
        entityId: booking.id,
        action: 'CREATE',
        after: {
          guestId: booking.guestId,
          checkInDate: toDateOnly(booking.checkInDate),
          checkOutDate: toDateOnly(booking.checkOutDate),
          source: booking.source,
          rooms: roomsSnapshot(booking.bookingRooms),
        },
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
        include: {
          bookingRooms: { include: { room: true } },
          guest: { include: GUEST_LOYALTY_INCLUDE },
          invoice: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items: items.map(withGuestLoyaltyBadge), total, page, pageSize };
  }

  async update(id: string, dto: UpdateBookingDto, actorId: string) {
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

      const updated = await tx.booking.update({
        where: { id },
        data: { checkInDate: checkIn, checkOutDate: checkOut },
        include: { bookingRooms: { include: { room: true } }, guest: true },
      });

      const before = { checkInDate: toDateOnly(existing.checkInDate), checkOutDate: toDateOnly(existing.checkOutDate), rooms: roomsSnapshot(existing.bookingRooms) };
      const after = { checkInDate: toDateOnly(updated.checkInDate), checkOutDate: toDateOnly(updated.checkOutDate), rooms: roomsSnapshot(updated.bookingRooms) };
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await this.auditLog.record(tx, {
          hotelId: existing.hotelId,
          actorId,
          entity: 'Booking',
          entityId: id,
          action: 'UPDATE',
          before,
          after,
        });
      }

      return updated;
    });
  }

  /**
   * Revert of a Booking UPDATE — restores the prior dates/room assignment,
   * re-running the same availability check `update()` does so a room booked
   * again since surfaces a clean conflict instead of a DB error. No audit
   * entry of its own; the caller (AuditLogsService.revert) writes the REVERT entry.
   */
  async restoreBookingDetails(id: string, before: { checkInDate: string; checkOutDate: string; rooms: RoomsSnapshot }) {
    return this.prisma.$transaction(async (tx) => {
      const checkIn = new Date(before.checkInDate);
      const checkOut = new Date(before.checkOutDate);
      const roomIds = before.rooms.map((r) => r.roomId);

      await this.availabilityService.assertRoomsAvailable(tx, { roomIds, checkIn, checkOut, excludeBookingId: id });

      await tx.bookingRoom.deleteMany({ where: { bookingId: id } });
      await tx.bookingRoom.createMany({
        data: before.rooms.map((r) => ({ bookingId: id, roomId: r.roomId, rateApplied: r.rate, occupants: r.occupants })),
      });

      return tx.booking.update({ where: { id }, data: { checkInDate: checkIn, checkOutDate: checkOut } });
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
  async extend(id: string, dto: ExtendBookingDto, actorId: string) {
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
        await this.housekeepingService.createDirtyTask(tx, { roomId: oldRoomId, priority: 1 });
        await tx.room.update({ where: { id: dto.roomId! }, data: { status: 'OCCUPIED' } });
      }

      const updated = await tx.booking.update({
        where: { id },
        data: { checkOutDate: newCheckOut },
        include: { bookingRooms: { include: { room: true } }, guest: true },
      });

      await this.auditLog.record(tx, {
        hotelId: existing.hotelId,
        actorId,
        entity: 'Booking',
        entityId: id,
        action: 'EXTEND',
        before: { checkOutDate: toDateOnly(existing.checkOutDate), rooms: roomsSnapshot(existing.bookingRooms) },
        after: { checkOutDate: toDateOnly(updated.checkOutDate), rooms: roomsSnapshot(updated.bookingRooms) },
      });

      return updated;
    });
  }

  /**
   * Upgrade/downgrade a single room within a CHECKED_IN booking. Unlike
   * extend()'s room move, this re-prices — but only from today onward: a
   * RoomChangeLog row records the split so CheckoutService can bill nights
   * already stayed at the old rate and the rest at the new one, since
   * BookingRoom itself only ever holds the current room/rate.
   */
  async changeRoom(id: string, dto: ChangeRoomBookingDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id }, include: { bookingRooms: true } });
      if (!existing) throw new NotFoundException('Booking not found');
      if (existing.hotelId !== dto.hotelId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Booking does not belong to this hotel' });
      }
      if (existing.status !== 'CHECKED_IN') {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking must be CHECKED_IN to change rooms, got ${existing.status}` });
      }

      const bookingRoom = existing.bookingRooms.find((br) => br.id === dto.bookingRoomId);
      if (!bookingRoom) throw new NotFoundException('This room is not part of the booking');

      const effectiveDate = todayUtcDateOnly();
      if (effectiveDate >= existing.checkOutDate) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'This booking is at or past its check-out date — extend the stay before changing rooms.',
        });
      }

      if (dto.newRoomId === bookingRoom.roomId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Already assigned to this room' });
      }

      const newRoom = await tx.room.findUnique({ where: { id: dto.newRoomId }, include: { roomType: true } });
      if (!newRoom || newRoom.hotelId !== dto.hotelId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Room does not belong to this hotel' });
      }
      this.assertWithinCapacity([{ roomId: newRoom.id, rate: dto.newRate, occupants: bookingRoom.occupants }], [newRoom]);

      await this.availabilityService.assertRoomsAvailable(tx, {
        roomIds: [dto.newRoomId],
        checkIn: effectiveDate,
        checkOut: existing.checkOutDate,
        excludeBookingId: id,
      });

      const previousRate = bookingRoom.rateApplied;
      const changeType = dto.newRate > Number(previousRate) ? 'UPGRADE' : dto.newRate < Number(previousRate) ? 'DOWNGRADE' : 'LATERAL';
      const oldRoomId = bookingRoom.roomId;

      await tx.bookingRoom.update({ where: { id: bookingRoom.id }, data: { roomId: dto.newRoomId, rateApplied: dto.newRate } });

      await tx.roomChangeLog.create({
        data: {
          bookingId: id,
          bookingRoomId: bookingRoom.id,
          fromRoomId: oldRoomId,
          toRoomId: dto.newRoomId,
          previousRate,
          newRate: dto.newRate,
          changeType,
          reason: dto.reason,
          effectiveDate,
          changedById: actorId,
        },
      });

      await tx.room.update({ where: { id: oldRoomId }, data: { status: 'DIRTY' } });
      await this.housekeepingService.createDirtyTask(tx, { roomId: oldRoomId, priority: 1 });
      await tx.room.update({ where: { id: dto.newRoomId }, data: { status: 'OCCUPIED' } });

      const updated = await tx.booking.findUniqueOrThrow({
        where: { id },
        include: { bookingRooms: { include: { room: true } }, guest: true },
      });

      await this.auditLog.record(tx, {
        hotelId: existing.hotelId,
        actorId,
        entity: 'Booking',
        entityId: id,
        action: changeType === 'UPGRADE' ? 'ROOM_UPGRADE' : changeType === 'DOWNGRADE' ? 'ROOM_DOWNGRADE' : 'ROOM_CHANGE',
        before: { roomId: oldRoomId, rate: Number(previousRate) },
        after: { roomId: dto.newRoomId, rate: dto.newRate, reason: dto.reason ?? null },
      });

      return updated;
    });
  }

  async cancel(id: string, actorId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (ACTIVE_STATUSES_BLOCKING_CANCEL.includes(booking.status)) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${booking.status} cannot be cancelled` });
    }
    const updated = await this.prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.auditLog.record(this.prisma, {
      hotelId: booking.hotelId,
      actorId,
      entity: 'Booking',
      entityId: id,
      action: 'CANCEL',
      before: { status: booking.status },
      after: { status: updated.status },
    });
    return updated;
  }

  // Only a CONFIRMED booking that never checked in can be marked a no-show —
  // once checked in, "didn't show up" no longer applies. Frees the room from
  // showing as reserved and stops it counting toward Dashboard's no-show
  // alert (see DashboardService.getNoShows).
  async noShow(id: string, actorId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${booking.status} cannot be marked as no-show` });
    }
    const updated = await this.prisma.booking.update({ where: { id }, data: { status: 'NO_SHOW' } });
    await this.auditLog.record(this.prisma, {
      hotelId: booking.hotelId,
      actorId,
      entity: 'Booking',
      entityId: id,
      action: 'NO_SHOW',
      before: { status: booking.status },
      after: { status: updated.status },
    });
    return updated;
  }

  /**
   * Revert of a Booking CANCEL/NO_SHOW — puts it back to CONFIRMED, re-checking
   * availability so a room rebooked in the meantime surfaces a clean conflict.
   * No audit entry of its own; the caller writes the REVERT entry.
   */
  async uncancel(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id }, include: { bookingRooms: true } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (!['CANCELLED', 'NO_SHOW'].includes(booking.status)) {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking is ${booking.status}, not cancelled or no-show` });
      }
      await this.availabilityService.assertRoomsAvailable(tx, {
        roomIds: booking.bookingRooms.map((br) => br.roomId),
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
        excludeBookingId: id,
      });
      return tx.booking.update({ where: { id }, data: { status: 'CONFIRMED' } });
    });
  }

  /** Revert of a Booking CREATE — cancels it, same guard as the public cancel() but without a second audit entry. */
  async cancelRaw(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (ACTIVE_STATUSES_BLOCKING_CANCEL.includes(booking.status)) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: `Booking in status ${booking.status} can no longer be reverted.` });
    }
    return this.prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}
