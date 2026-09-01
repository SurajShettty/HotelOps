import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localTimeHHmm } from '../../common/date.util';

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

    const [
      revenueToday,
      revenueMonthToDate,
      roomsNotReadyForArrivals,
      overdueHousekeeping,
      roomsOutOfService,
      noShows,
      overstays,
      arrivalsToday,
      departuresToday,
    ] = await Promise.all([
      this.netRevenue(hotelId, todayStart, tomorrowStart),
      this.netRevenue(hotelId, monthStart, tomorrowStart),
      this.getRoomsNotReadyForArrivals(hotelId, todayStart, tomorrowStart),
      this.getOverdueHousekeeping(hotelId, now),
      this.getRoomsOutOfService(hotelId, now),
      this.getNoShows(hotelId, todayStart),
      this.getOverstays(hotelId, now, todayStart, tomorrowStart),
      this.getArrivalsCompletedToday(hotelId, todayStart, tomorrowStart),
      this.getDeparturesCompletedToday(hotelId, todayStart, tomorrowStart),
    ]);

    return {
      revenue: { today: revenueToday, monthToDate: revenueMonthToDate },
      today: { arrivals: arrivalsToday, departures: departuresToday },
      alerts: { roomsNotReadyForArrivals, overdueHousekeeping, roomsOutOfService, noShows, overstays },
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

  // Still CONFIRMED (never checked in) with a checkInDate before today —
  // resolved by either checking them in late or POST /bookings/:id/no-show.
  private async getNoShows(hotelId: string, todayStart: Date) {
    const bookings = await this.prisma.booking.findMany({
      where: { hotelId, status: 'CONFIRMED', checkInDate: { lt: todayStart } },
      include: { guest: true, bookingRooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
    });

    return bookings.map((b) => ({
      bookingId: b.id,
      guestName: b.guest.fullName,
      roomNumbers: b.bookingRooms.map((br) => br.room.roomNumber),
      checkInDate: b.checkInDate,
    }));
  }

  // Still CHECKED_IN past their checkOutDate — either a prior day entirely,
  // or today but only once the hotel's standard check-out time has actually
  // passed (a guest checking out later this afternoon isn't late yet). Same
  // "is it late right now" check as the late-check-out fee at actual checkout
  // (CheckoutService.computeFolio) — this just surfaces it proactively.
  private async getOverstays(hotelId: string, now: Date, todayStart: Date, tomorrowStart: Date) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const pastCheckOutTimeToday = localTimeHHmm(now, hotel.timezone) > hotel.checkOutTime;
    const cutoff = pastCheckOutTimeToday ? tomorrowStart : todayStart;

    const bookings = await this.prisma.booking.findMany({
      where: { hotelId, status: 'CHECKED_IN', checkOutDate: { lt: cutoff } },
      include: { guest: true, bookingRooms: { include: { room: true } } },
      orderBy: { checkOutDate: 'asc' },
    });

    return bookings.map((b) => ({
      bookingId: b.id,
      guestName: b.guest.fullName,
      roomNumbers: b.bookingRooms.map((br) => br.room.roomNumber),
      checkOutDate: b.checkOutDate,
      checkOutTime: hotel.checkOutTime,
      dueToday: b.checkOutDate >= todayStart,
    }));
  }

  // Arrivals *completed* today — checkInDate is stamped with the actual
  // arrival date at check-in (see CheckinService), so this counts bookings
  // that have moved past CONFIRMED, not ones merely due to arrive. A guest
  // who both arrived and departed today still counts here.
  private async getArrivalsCompletedToday(hotelId: string, todayStart: Date, tomorrowStart: Date) {
    return this.prisma.booking.count({
      where: {
        hotelId,
        checkInDate: { gte: todayStart, lt: tomorrowStart },
        status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
      },
    });
  }

  // Checkouts *completed* today — checkOutDate is stamped with the actual
  // departure date at checkout (see CheckoutService), so this counts
  // bookings that have actually checked out, not ones merely due to leave.
  private async getDeparturesCompletedToday(hotelId: string, todayStart: Date, tomorrowStart: Date) {
    return this.prisma.booking.count({
      where: {
        hotelId,
        checkOutDate: { gte: todayStart, lt: tomorrowStart },
        status: { in: ['CHECKED_OUT', 'COMPLETED'] },
      },
    });
  }

  /**
   * Day-by-day revenue and occupancy for the trailing `days` days (today
   * included), plus a booking-source breakdown over the same window — feeds
   * the Dashboard's trend charts.
   *
   * Occupancy per day is a historical reconstruction: which rooms had an
   * active (non-cancelled/no-show/draft) booking covering that date, not a
   * snapshot of Room.status (which only reflects *right now*). Revenue
   * reuses the same CHARGE-minus-REFUND definition as the summary KPI.
   */
  async getTrends(hotelId: string, days: number) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const rangeEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const rangeStart = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const [totalRooms, activeBookings, sourceRows] = await Promise.all([
      this.prisma.room.count({ where: { hotelId } }),
      this.prisma.booking.findMany({
        where: {
          hotelId,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'DRAFT'] },
          checkInDate: { lt: rangeEnd },
          checkOutDate: { gt: rangeStart },
        },
        select: { checkInDate: true, checkOutDate: true, bookingRooms: { select: { roomId: true } } },
      }),
      this.prisma.booking.groupBy({
        by: ['source'],
        where: {
          hotelId,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'DRAFT'] },
          checkInDate: { lt: rangeEnd },
          checkOutDate: { gt: rangeStart },
        },
        _count: { _all: true },
      }),
    ]);

    const dayStarts: Date[] = [];
    for (let d = rangeStart; d < rangeEnd; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      dayStarts.push(d);
    }

    const revenueByDay = await Promise.all(
      dayStarts.map((d) => this.netRevenue(hotelId, d, new Date(d.getTime() + 24 * 60 * 60 * 1000))),
    );

    const dayRows = dayStarts.map((d, i) => {
      const occupiedRoomIds = new Set<string>();
      for (const b of activeBookings) {
        if (b.checkInDate <= d && b.checkOutDate > d) {
          for (const br of b.bookingRooms) occupiedRoomIds.add(br.roomId);
        }
      }
      return {
        date: d.toISOString().slice(0, 10),
        revenue: revenueByDay[i],
        occupancyPct: totalRooms > 0 ? Math.round((occupiedRoomIds.size / totalRooms) * 100) : 0,
      };
    });

    return {
      days: dayRows,
      bookingSources: sourceRows.map((r) => ({ source: r.source, count: r._count._all })),
    };
  }
}
