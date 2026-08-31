import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForHotel(hotelId: string, opts: { status?: string; roomTypeId?: string } = {}) {
    return this.prisma.room.findMany({
      where: {
        hotelId,
        ...(opts.status ? { status: opts.status as never } : {}),
        ...(opts.roomTypeId ? { roomTypeId: opts.roomTypeId } : {}),
      },
      include: { roomType: true },
      orderBy: { roomNumber: 'asc' },
    });
  }

  create(data: { hotelId: string; roomTypeId: string; roomNumber: string; floor?: string }) {
    return this.prisma.room.create({ data });
  }

  updateStatus(id: string, status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'OUT_OF_ORDER') {
    return this.prisma.room.update({ where: { id }, data: { status } });
  }
}
