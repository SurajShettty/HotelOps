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

  /**
   * One row per invoice (completed stay) rather than the aggregate revenue()
   * above — room(s) and guest are shown together per row since a checkout's
   * financial breakdown (roomSubtotal, charges, tax, etc.) only exists at the
   * invoice level, not split per room; a multi-room booking still lists every
   * room it covered so it's findable by any of them.
   */
  async revenueDetailed(hotelId: string, from: Date, to: Date, page?: string, pageSize?: string) {
    const { page: p, pageSize: ps, skip, take } = normalizePagination(page, pageSize);
    const where = { booking: { hotelId }, issuedAt: { gte: from, lt: to } };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        include: {
          booking: {
            include: {
              guest: { select: { id: true, fullName: true } },
              bookingRooms: { include: { room: { select: { roomNumber: true } } } },
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map((inv) => ({
        invoiceId: inv.id,
        issuedAt: inv.issuedAt,
        guestId: inv.booking.guest.id,
        guestName: inv.booking.guest.fullName,
        roomNumbers: inv.booking.bookingRooms.map((br) => br.room.roomNumber),
        nights: inv.nights,
        roomSubtotal: inv.roomSubtotal,
        chargesTotal: inv.chargesTotal,
        discountTotal: inv.discountTotal,
        taxTotal: inv.taxTotal,
        grandTotal: inv.grandTotal,
      })),
      total,
      page: p,
      pageSize: ps,
    };
  }

  /**
   * One row per staff member (plus an "Unassigned" row) covering every task
   * in range, not just completed ones — a staff member with a pile of DIRTY
   * tasks still sitting there is exactly what this should surface.
   */
  async housekeepingByStaff(hotelId: string, from: Date, to: Date) {
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId }, createdAt: { gte: from, lt: to } },
      select: {
        assignedToId: true,
        assignedTo: { select: { fullName: true } },
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    interface Bucket {
      staffId: string | null;
      staffName: string;
      totalTasks: number;
      completedTasks: number;
      totalCompletionMinutes: number;
    }
    const byStaff = new Map<string, Bucket>();
    for (const t of tasks) {
      const key = t.assignedToId ?? 'unassigned';
      if (!byStaff.has(key)) {
        byStaff.set(key, {
          staffId: t.assignedToId,
          staffName: t.assignedTo?.fullName ?? 'Unassigned',
          totalTasks: 0,
          completedTasks: 0,
          totalCompletionMinutes: 0,
        });
      }
      const bucket = byStaff.get(key)!;
      bucket.totalTasks += 1;
      if (t.status === 'READY' && t.completedAt) {
        bucket.completedTasks += 1;
        bucket.totalCompletionMinutes += (t.completedAt.getTime() - t.createdAt.getTime()) / 60000;
      }
    }

    return Array.from(byStaff.values())
      .map(({ totalCompletionMinutes, completedTasks, ...rest }) => ({
        ...rest,
        completedTasks,
        avgCompletionMinutes: completedTasks > 0 ? Math.round(totalCompletionMinutes / completedTasks) : null,
      }))
      .sort((a, b) => b.totalTasks - a.totalTasks);
  }
}
