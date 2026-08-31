import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Matches the PRD's housekeeping-turnaround KPI (dirty -> ready in < 45 min
// average) — a task open longer than that is worth flagging to an owner.
const OVERDUE_HOUSEKEEPING_MINUTES = 45;

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(hotelId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = startOfMonth(now);

    const [revenueToday, revenueMonthToDate, roomsNotReadyForArrivals, overdueHousekeeping, roomsOutOfService] =
      await Promise.all([
        this.netRevenue(hotelId, todayStart, tomorrowStart),
        this.netRevenue(hotelId, monthStart, tomorrowStart),
        this.getRoomsNotReadyForArrivals(hotelId, todayStart, tomorrowStart),
        this.getOverdueHousekeeping(hotelId, now),
        this.getRoomsOutOfService(hotelId, now),
      ]);

    return {
      revenue: { today: revenueToday, monthToDate: revenueMonthToDate },
      alerts: { roomsNotReadyForArrivals, overdueHousekeeping, roomsOutOfService },
    };
  }

  // Payments (not invoices) are the actual cash ledger — they're recorded at
  // check-in deposit and checkout settlement, so they reflect money collected
  // today even for guests who haven't checked out (and therefore have no
  // invoice) yet.
  private async netRevenue(hotelId: string, from: Date, to: Date) {
    const [charges, refunds] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { type: 'CHARGE', createdAt: { gte: from, lt: to }, booking: { hotelId } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { type: 'REFUND', createdAt: { gte: from, lt: to }, booking: { hotelId } },
        _sum: { amount: true },
      }),
    ]);
    return Number(charges._sum.amount ?? 0) - Number(refunds._sum.amount ?? 0);
  }

  private async getRoomsNotReadyForArrivals(hotelId: string, todayStart: Date, tomorrowStart: Date) {
    const arrivals = await this.prisma.booking.findMany({
      where: {
        hotelId,
        status: 'CONFIRMED',
        checkInDate: { gte: todayStart, lt: tomorrowStart },
      },
      include: { guest: true, bookingRooms: { include: { room: true } } },
    });

    return arrivals
      .flatMap((booking) =>
        booking.bookingRooms
          .filter((br) => br.room.status !== 'AVAILABLE')
          .map((br) => ({
            bookingId: booking.id,
            guestName: booking.guest.fullName,
            roomNumber: br.room.roomNumber,
            roomStatus: br.room.status,
          })),
      );
  }

  private async getOverdueHousekeeping(hotelId: string, now: Date) {
    const cutoff = new Date(now.getTime() - OVERDUE_HOUSEKEEPING_MINUTES * 60 * 1000);
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId }, status: { not: 'READY' }, createdAt: { lt: cutoff } },
      include: { room: true },
      orderBy: { createdAt: 'asc' },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      roomNumber: task.room.roomNumber,
      status: task.status,
      minutesOpen: Math.round((now.getTime() - task.createdAt.getTime()) / 60000),
    }));
  }

  private async getRoomsOutOfService(hotelId: string, now: Date) {
    const [outOfOrderRooms, activeBlocks] = await Promise.all([
      this.prisma.room.findMany({ where: { hotelId, status: 'OUT_OF_ORDER' } }),
      this.prisma.roomBlock.findMany({
        where: { room: { hotelId }, startDate: { lte: now }, endDate: { gt: now } },
        include: { room: true },
      }),
    ]);

    const byRoomId = new Map<string, { roomId: string; roomNumber: string; reason: string }>();
    for (const room of outOfOrderRooms) {
      byRoomId.set(room.id, { roomId: room.id, roomNumber: room.roomNumber, reason: 'OUT_OF_ORDER' });
    }
    for (const block of activeBlocks) {
      if (!byRoomId.has(block.roomId)) {
        byRoomId.set(block.roomId, { roomId: block.roomId, roomNumber: block.room.roomNumber, reason: block.reason });
      }
    }
    return Array.from(byRoomId.values());
  }
}
