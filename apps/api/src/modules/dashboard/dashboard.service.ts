import { Injectable } from '@nestjs/common';
import { Hotel } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { localTimeHHmm, startOfDayInTimeZone, startOfMonthInTimeZone } from '../../common/date.util';

// Matches the PRD's housekeeping-turnaround KPI (dirty -> ready in < 45 min
// average) — a task open longer than that is worth flagging to an owner.
const OVERDUE_HOUSEKEEPING_MINUTES = 45;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `includeRevenue` gates the financial figures (revenue.today/monthToDate)
   * to callers the controller has confirmed hold a finance-visible role for
   * this hotel — everyone else gets `revenue: null` and the underlying
   * Payment aggregates aren't even queried, so the numbers never leave the
   * database for a caller who shouldn't see them.
   */
  async getSummary(hotelId: string, includeRevenue: boolean) {
    const now = new Date();
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    // "Today"/"this month" are the hotel's own local calendar day/month, per
    // its timezone setting — not the server's UTC date.
    const todayStart = startOfDayInTimeZone(now, hotel.timezone);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = startOfMonthInTimeZone(now, hotel.timezone);

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
      occupancyPct,
    ] = await Promise.all([
      includeRevenue ? this.netRevenue(hotelId, todayStart, tomorrowStart) : Promise.resolve(null),
      includeRevenue ? this.netRevenue(hotelId, monthStart, tomorrowStart) : Promise.resolve(null),
      this.getRoomsNotReadyForArrivals(hotelId, todayStart, tomorrowStart),
      this.getOverdueHousekeeping(hotelId, now),
      this.getRoomsOutOfService(hotelId, now),
      this.getNoShows(hotelId, todayStart),
      this.getOverstays(hotel, now, todayStart, tomorrowStart),
      this.getArrivalsCompletedToday(hotelId, todayStart, tomorrowStart),
      this.getDeparturesCompletedToday(hotelId, todayStart, tomorrowStart),
      this.getTodayOccupancyPct(hotelId, todayStart, tomorrowStart),
    ]);

    return {
      revenue: includeRevenue ? { today: revenueToday, monthToDate: revenueMonthToDate } : null,
      today: { arrivals: arrivalsToday, departures: departuresToday, occupancyPct },
      alerts: { roomsNotReadyForArrivals, overdueHousekeeping, roomsOutOfService, noShows, overstays },
    };
  }

  // Same "booked for today" definition as getTrends' today bucket (see
  // occupiesRoomToday below) — kept as the one place both the live dashboard
  // KPI and the trend chart's today point get their number from, so the two
  // can never silently drift apart the way a duplicated calculation would.
  private async getTodayOccupancyPct(hotelId: string, todayStart: Date, tomorrowStart: Date): Promise<number> {
    const [totalRooms, bookings] = await Promise.all([
      this.prisma.room.count({ where: { hotelId } }),
      this.prisma.booking.findMany({
        where: {
          hotelId,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'DRAFT'] },
          checkInDate: { lt: tomorrowStart },
          // A CHECKED_IN booking still occupies its room regardless of its
          // *planned* checkOutDate — occupiesRoomToday below is what actually
          // decides that case (checkInDate <= today, guest hasn't checked out
          // yet). Filtering on checkOutDate > todayStart here too would drop
          // exactly those rows — a guest due out today but still in the room —
          // before occupiesRoomToday ever got a chance to see them.
          OR: [{ checkOutDate: { gt: todayStart } }, { status: 'CHECKED_IN' }],
        },
        select: { status: true, checkInDate: true, checkOutDate: true, bookingRooms: { select: { roomId: true } } },
      }),
    ]);
    const occupiedRoomIds = this.computeOccupiedRoomIds(bookings, todayStart, true);
    return totalRooms > 0 ? Math.round((occupiedRoomIds.size / totalRooms) * 100) : 0;
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
      include: { room: true, assignedTo: true },
      orderBy: { createdAt: 'asc' },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      roomNumber: task.room.roomNumber,
      status: task.status,
      minutesOpen: Math.round((now.getTime() - task.createdAt.getTime()) / 60000),
      assignedToName: task.assignedTo?.fullName ?? null,
      assignedToId: task.assignedToId,
      nudgedMinutesAgo: task.nudgedAt ? Math.round((now.getTime() - task.nudgedAt.getTime()) / 60000) : null,
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
  private async getOverstays(hotel: Hotel, now: Date, todayStart: Date, tomorrowStart: Date) {
    const pastCheckOutTimeToday = localTimeHHmm(now, hotel.timezone) > hotel.checkOutTime;
    const cutoff = pastCheckOutTimeToday ? tomorrowStart : todayStart;

    const bookings = await this.prisma.booking.findMany({
      where: { hotelId: hotel.id, status: 'CHECKED_IN', checkOutDate: { lt: cutoff } },
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

  // Arrivals *completed* today (today = the hotel's own local calendar day,
  // per its timezone setting, not the server's UTC day) — checkInDate is
  // stamped with the actual arrival date at check-in (see CheckinService),
  // so this counts bookings that have moved past CONFIRMED, not ones merely
  // due to arrive. A guest who both arrived and departed today still counts here.
  private async getArrivalsCompletedToday(hotelId: string, todayStart: Date, tomorrowStart: Date) {
    return this.prisma.booking.count({
      where: {
        hotelId,
        checkInDate: { gte: todayStart, lt: tomorrowStart },
        status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
      },
    });
  }

  // Checkouts *completed* today (hotel-local calendar day, see
  // getArrivalsCompletedToday above) — checkOutDate is stamped with the
  // actual departure date at checkout (see CheckoutService), so this counts
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
   *
   * `includeRevenue` mirrors getSummary's gate — callers without a
   * finance-visible role get `revenue: null` per day and skip the
   * underlying Payment aggregates entirely.
   */
  async getTrends(hotelId: string, days: number, includeRevenue: boolean) {
    const now = new Date();
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const todayStart = startOfDayInTimeZone(now, hotel.timezone);
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
        select: { status: true, checkInDate: true, checkOutDate: true, bookingRooms: { select: { roomId: true } } },
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

    const revenueByDay = includeRevenue
      ? await Promise.all(dayStarts.map((d) => this.netRevenue(hotelId, d, new Date(d.getTime() + 24 * 60 * 60 * 1000))))
      : dayStarts.map(() => null);

    const dayRows = dayStarts.map((d, i) => {
      const isToday = d.getTime() === todayStart.getTime();
      const occupiedRoomIds = this.computeOccupiedRoomIds(activeBookings, d, isToday);
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

  /**
   * Whether a booking occupies its room *today* specifically — unlike past
   * days in the trend, today needs real stay state, not just date-range
   * arithmetic, at the checkOutDate boundary:
   *  - Already CHECKED_OUT/COMPLETED: the guest is gone regardless of what
   *    checkOutDate says — the one-night billing floor (CheckoutService) can
   *    leave it later than today even for a same-day check-in/check-out.
   *  - Still CHECKED_IN with checkOutDate == today: the guest hasn't
   *    actually left yet, so the room stays occupied through today even
   *    though the half-open [checkInDate, checkOutDate) test below would
   *    otherwise drop it right at the checkout date.
   */
  private occupiesRoomToday(b: { status: string; checkInDate: Date; checkOutDate: Date }, today: Date): boolean {
    if (b.status === 'CHECKED_OUT' || b.status === 'COMPLETED') return false;
    if (b.status === 'CHECKED_IN') return b.checkInDate <= today;
    return b.checkInDate <= today && b.checkOutDate > today;
  }

  /** Room ids occupied on `day` by `bookings` — `occupiesRoomToday`'s real-status test for today, plain date-range membership for any other day. */
  private computeOccupiedRoomIds(
    bookings: { status: string; checkInDate: Date; checkOutDate: Date; bookingRooms: { roomId: string }[] }[],
    day: Date,
    isToday: boolean,
  ): Set<string> {
    const occupiedRoomIds = new Set<string>();
    for (const b of bookings) {
      const covers = isToday ? this.occupiesRoomToday(b, day) : b.checkInDate <= day && b.checkOutDate > day;
      if (!covers) continue;
      for (const br of b.bookingRooms) occupiedRoomIds.add(br.roomId);
    }
    return occupiedRoomIds;
  }
}
