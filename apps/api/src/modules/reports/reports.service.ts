import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePagination } from '../../common/pagination';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async occupancy(hotelId: string, from: Date, to: Date) {
    const totalRooms = await this.prisma.room.count({ where: { hotelId } });
    const bookedRoomNights = await this.prisma.bookingRoom.count({
      where: {
        room: { hotelId },
        booking: { status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] }, checkInDate: { lt: to }, checkOutDate: { gt: from } },
      },
    });
    return { totalRooms, bookedRoomNights, from, to };
  }

  async revenue(hotelId: string, from: Date, to: Date) {
    const result = await this.prisma.invoice.aggregate({
      where: { booking: { hotelId }, issuedAt: { gte: from, lt: to } },
      _sum: { grandTotal: true, taxTotal: true },
      _count: true,
    });
    return { invoiceCount: result._count, totalRevenue: result._sum.grandTotal ?? 0, totalTax: result._sum.taxTotal ?? 0, from, to };
  }

  async bookings(hotelId: string, from: Date, to: Date, page?: string, pageSize?: string) {
    const { page: p, pageSize: ps, skip, take } = normalizePagination(page, pageSize);
    const where = { hotelId, checkInDate: { gte: from, lt: to } };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, skip, take, include: { guest: true, bookingRooms: true }, orderBy: { checkInDate: 'asc' } }),
      this.prisma.booking.count({ where }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async cancellations(hotelId: string, from: Date, to: Date, page?: string, pageSize?: string) {
    const { page: p, pageSize: ps, skip, take } = normalizePagination(page, pageSize);
    const where = { hotelId, status: { in: ['CANCELLED', 'NO_SHOW'] } as never, checkInDate: { gte: from, lt: to } };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, skip, take, include: { guest: true }, orderBy: { checkInDate: 'asc' } }),
      this.prisma.booking.count({ where }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  async housekeeping(hotelId: string, from: Date, to: Date, page?: string, pageSize?: string) {
    const { page: p, pageSize: ps, skip, take } = normalizePagination(page, pageSize);
    const where = { room: { hotelId }, createdAt: { gte: from, lt: to } };
    const [items, total] = await Promise.all([
      this.prisma.housekeepingTask.findMany({ where, skip, take, include: { room: true, assignedTo: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.housekeepingTask.count({ where }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }
}
