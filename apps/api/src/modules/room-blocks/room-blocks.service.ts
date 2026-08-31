import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../rooms/availability.service';
import { CreateRoomBlockDto } from './dto/create-room-block.dto';

@Injectable()
export class RoomBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async create(dto: CreateRoomBlockDto, createdById: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'endDate must be after startDate' });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.availabilityService.assertRoomsAvailable(tx, {
        roomIds: [dto.roomId],
        checkIn: startDate,
        checkOut: endDate,
      });

      return tx.roomBlock.create({
        data: {
          roomId: dto.roomId,
          reason: dto.reason,
          startDate,
          endDate,
          notes: dto.notes,
          createdById,
        },
      });
    });
  }

  findAllForRoom(roomId: string) {
    return this.prisma.roomBlock.findMany({ where: { roomId }, orderBy: { startDate: 'asc' } });
  }
}
