import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../rooms/availability.service';
import { normalizePagination } from '../../common/pagination';
import { BookingRoomInput, CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

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

  findOne(id: string) {
    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: { bookingRooms: { include: { room: true } }, guest: true, payments: true, invoice: true },
    });
  }

  async findAllForHotel(
    hotelId: string,
    opts: { status?: string; search?: string; from?: string; to?: string; page?: string; pageSize?: string },
  ) {
    const { page, pageSize, skip, take } = normalizePagination(opts.page, opts.pageSize);

    const where: Prisma.BookingWhereInput = {
      hotelId,
      ...(opts.status ? { status: opts.status as never } : {}),
      ...(opts.search ? { guest: { fullName: { contains: opts.search, mode: 'insensitive' } } } : {}),
      ...(opts.from ? { checkInDate: { gte: new Date(opts.from) } } : {}),
      ...(opts.to ? { checkOutDate: { lte: new Date(opts.to) } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        include: { bookingRooms: { include: { room: true } }, guest: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, pageSize };
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

  async cancel(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (ACTIVE_STATUSES_BLOCKING_CANCEL.includes(booking.status)) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking in status ${booking.status} cannot be cancelled` });
    }
    return this.prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}
