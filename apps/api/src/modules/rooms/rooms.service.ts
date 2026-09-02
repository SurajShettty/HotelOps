import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, fieldDiff, snapshot } from '../audit-logs/audit-log.service';

const ROOM_FIELDS = ['roomTypeId', 'roomNumber', 'floor'] as const;

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAllForHotel(hotelId: string, opts: { status?: string; roomTypeId?: string; floor?: string } = {}) {
    return this.prisma.room.findMany({
      where: {
        hotelId,
        ...(opts.status ? { status: opts.status as never } : {}),
        ...(opts.roomTypeId ? { roomTypeId: opts.roomTypeId } : {}),
        ...(opts.floor ? { floor: opts.floor } : {}),
      },
      include: { roomType: true },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async create(data: { hotelId: string; roomTypeId: string; roomNumber: string; floor?: string }, actorId: string) {
    const room = await this.prisma.room.create({ data });
    await this.auditLog.record(this.prisma, {
      hotelId: room.hotelId,
      actorId,
      entity: 'Room',
      entityId: room.id,
      action: 'CREATE',
      after: snapshot(room, ROOM_FIELDS),
    });
    return room;
  }

  async updateStatus(id: string, status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'OUT_OF_ORDER', actorId: string) {
    const before = await this.prisma.room.findUniqueOrThrow({ where: { id } });
    if (status === 'OCCUPIED' && !(await this.hasActiveOccupant(id))) {
      throw new BadRequestException({
        code: 'NO_ACTIVE_BOOKING',
        message: 'Cannot mark a room occupied without a checked-in booking. Use check-in instead.',
      });
    }
    const after = await this.prisma.room.update({ where: { id }, data: { status } });
    const diff = fieldDiff(before, after, ['status'] as const);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId,
      entity: 'Room',
      entityId: id,
      action: 'STATUS_CHANGE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  async updateFloor(id: string, floor: string | null, actorId: string) {
    const before = await this.prisma.room.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.room.update({ where: { id }, data: { floor } });
    const diff = fieldDiff(before, after, ['floor'] as const);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId,
      entity: 'Room',
      entityId: id,
      action: 'FLOOR_CHANGE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  /** Revert of a Room CREATE — refuses if the room has since been booked. */
  async removeIfUnreferenced(id: string) {
    const bookingRoomsCount = await this.prisma.bookingRoom.count({ where: { roomId: id } });
    if (bookingRoomsCount > 0) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: 'This room already has bookings and can no longer be removed.' });
    }
    await this.prisma.room.delete({ where: { id } });
  }

  /** Revert of Room STATUS_CHANGE/FLOOR_CHANGE — reapplies a stored field snapshot without re-logging. */
  async restoreFields(id: string, fields: Record<string, unknown>) {
    if (fields.status === 'OCCUPIED' && !(await this.hasActiveOccupant(id))) {
      throw new BadRequestException({
        code: 'NOT_REVERTIBLE',
        message: 'Cannot revert to OCCUPIED: this room no longer has a checked-in booking.',
      });
    }
    await this.prisma.room.update({ where: { id }, data: fields as Prisma.RoomUpdateInput });
  }

  /** True if some CHECKED_IN booking currently occupies this room. */
  private async hasActiveOccupant(roomId: string): Promise<boolean> {
    const count = await this.prisma.bookingRoom.count({ where: { roomId, booking: { status: 'CHECKED_IN' } } });
    return count > 0;
  }
}
