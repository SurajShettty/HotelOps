import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface HotelPolicyFields {
  checkInTime?: string;
  checkOutTime?: string;
  earlyCheckInFee?: number;
  lateCheckOutFee?: number;
}

@Injectable()
export class HotelsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertValidPolicy(fields: HotelPolicyFields) {
    for (const [label, value] of [
      ['checkInTime', fields.checkInTime],
      ['checkOutTime', fields.checkOutTime],
    ] as const) {
      if (value !== undefined && !TIME_PATTERN.test(value)) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${label} must be in 24-hour "HH:mm" format` });
      }
    }
    for (const [label, value] of [
      ['earlyCheckInFee', fields.earlyCheckInFee],
      ['lateCheckOutFee', fields.lateCheckOutFee],
    ] as const) {
      if (value !== undefined && value < 0) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${label} cannot be negative` });
      }
    }
  }

  findAll() {
    return this.prisma.hotel.findMany();
  }

  findOne(id: string) {
    return this.prisma.hotel.findUniqueOrThrow({ where: { id } });
  }

  create(data: { name: string; timezone?: string; address?: Prisma.InputJsonValue } & HotelPolicyFields) {
    this.assertValidPolicy(data);
    return this.prisma.hotel.create({ data });
  }

  update(id: string, data: Partial<{ name: string; timezone: string; address: Prisma.InputJsonValue } & HotelPolicyFields>) {
    this.assertValidPolicy(data);
    return this.prisma.hotel.update({ where: { id }, data });
  }
}
