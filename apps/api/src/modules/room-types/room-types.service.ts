import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, fieldDiff, snapshot } from '../audit-logs/audit-log.service';

const ROOM_TYPE_FIELDS = ['name', 'baseOccupancy', 'maxOccupancy', 'baseRate', 'amenities'] as const;

@Injectable()
export class RoomTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAllForHotel(hotelId: string) {
    return this.prisma.roomType.findMany({ where: { hotelId } });
  }

  async create(
    data: {
      hotelId: string;
      name: string;
      baseOccupancy?: number;
      maxOccupancy?: number;
      baseRate: number;
      amenities?: Prisma.InputJsonValue;
    },
    actorId: string,
  ) {
    const roomType = await this.prisma.roomType.create({ data });
    await this.auditLog.record(this.prisma, {
      hotelId: roomType.hotelId,
      actorId,
      entity: 'RoomType',
      entityId: roomType.id,
      action: 'CREATE',
      after: snapshot(roomType, ROOM_TYPE_FIELDS),
    });
    return roomType;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      baseRate: number;
      baseOccupancy: number;
      maxOccupancy: number;
      amenities: Prisma.InputJsonValue;
    }>,
    actorId: string,
  ) {
    const before = await this.prisma.roomType.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.roomType.update({ where: { id }, data });
    const diff = fieldDiff(before, after, ROOM_TYPE_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId,
      entity: 'RoomType',
      entityId: id,
      action: 'UPDATE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  /** Revert of a RoomType CREATE — refuses if any rooms have since been created under it. */
  async removeIfUnreferenced(id: string) {
    const roomsCount = await this.prisma.room.count({ where: { roomTypeId: id } });
    if (roomsCount > 0) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: 'This room type already has rooms and can no longer be removed.' });
    }
    await this.prisma.roomType.delete({ where: { id } });
  }

  /** Revert of a RoomType UPDATE — reapplies a stored field snapshot without re-logging. */
  async restoreFields(id: string, fields: Record<string, unknown>) {
    await this.prisma.roomType.update({ where: { id }, data: fields as Prisma.RoomTypeUpdateInput });
  }
}
