import { Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HotelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.hotel.findMany();
  }

  findOne(id: string) {
    return this.prisma.hotel.findUniqueOrThrow({ where: { id } });
  }

  create(data: { name: string; timezone?: string; address?: Prisma.InputJsonValue }) {
    return this.prisma.hotel.create({ data });
  }

  update(id: string, data: Partial<{ name: string; timezone: string; address: Prisma.InputJsonValue }>) {
    return this.prisma.hotel.update({ where: { id }, data });
  }
}
