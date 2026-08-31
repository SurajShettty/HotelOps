import { Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForHotel(hotelId: string) {
    return this.prisma.roomType.findMany({ where: { hotelId } });
  }

  create(data: {
    hotelId: string;
    name: string;
    baseOccupancy?: number;
    maxOccupancy?: number;
    baseRate: number;
    amenities?: Prisma.InputJsonValue;
  }) {
    return this.prisma.roomType.create({ data });
  }

  update(id: string, data: Partial<{ name: string; baseRate: number; baseOccupancy: number; maxOccupancy: number }>) {
    return this.prisma.roomType.update({ where: { id }, data });
  }
}
