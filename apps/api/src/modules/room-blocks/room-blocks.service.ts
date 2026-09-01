import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../rooms/availability.service';
import { AuditLogService, snapshot } from '../audit-logs/audit-log.service';
import { CreateRoomBlockDto } from './dto/create-room-block.dto';

const BLOCK_FIELDS = ['roomId', 'reason', 'startDate', 'endDate', 'notes', 'createdById'] as const;

@Injectable()
export class RoomBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateRoomBlockDto, createdById: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'endDate must be after startDate' });
    }

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUniqueOrThrow({ where: { id: dto.roomId } });

      await this.availabilityService.assertRoomsAvailable(tx, {
        roomIds: [dto.roomId],
        checkIn: startDate,
        checkOut: endDate,
      });

      const block = await tx.roomBlock.create({
        data: {
          roomId: dto.roomId,
          reason: dto.reason,
          startDate,
          endDate,
          notes: dto.notes,
          createdById,
        },
      });

      await this.auditLog.record(tx, {
        hotelId: room.hotelId,
        actorId: createdById,
        entity: 'RoomBlock',
        entityId: block.id,
        action: 'CREATE',
        after: snapshot(block, BLOCK_FIELDS),
      });

      return block;
    });
  }

  findAllForRoom(roomId: string) {
    return this.prisma.roomBlock.findMany({ where: { roomId }, orderBy: { startDate: 'asc' } });
  }

  async remove(id: string, actorId: string) {
    const block = await this.prisma.roomBlock.findUnique({ where: { id }, include: { room: { select: { hotelId: true } } } });
    if (!block) throw new NotFoundException('Room block not found');
    await this.prisma.roomBlock.delete({ where: { id } });
    await this.auditLog.record(this.prisma, {
      hotelId: block.room.hotelId,
      actorId,
      entity: 'RoomBlock',
      entityId: id,
      action: 'DELETE',
      before: snapshot(block, BLOCK_FIELDS),
    });
  }

  /** Revert of a RoomBlock CREATE — plain delete, no audit entry of its own (the caller writes the REVERT entry). */
  async removeById(id: string) {
    const block = await this.prisma.roomBlock.findUnique({ where: { id } });
    if (!block) return;
    await this.prisma.roomBlock.delete({ where: { id } });
  }

  /**
   * Revert of a RoomBlock DELETE — recreates it with the same id and fields,
   * re-running the same availability check `create()` does so a room that's
   * been rebooked since surfaces a clean conflict instead of a DB error.
   */
  async recreate(id: string, fields: { roomId: string; reason: string; startDate: string; endDate: string; notes: string | null; createdById: string }) {
    const startDate = new Date(fields.startDate);
    const endDate = new Date(fields.endDate);
    return this.prisma.$transaction(async (tx) => {
      await this.availabilityService.assertRoomsAvailable(tx, { roomIds: [fields.roomId], checkIn: startDate, checkOut: endDate });
      return tx.roomBlock.create({
        data: {
          id,
          roomId: fields.roomId,
          reason: fields.reason as never,
          startDate,
          endDate,
          notes: fields.notes,
          createdById: fields.createdById,
        },
      });
    });
  }
}
