import { Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDayInTimeZone } from '../../common/date.util';
import { GUEST_LOYALTY_INCLUDE, getGuestLoyaltyTier } from '../guests/guest-loyalty';

// How far back a just-created booking still counts as a fresh "confirmation" notification.
const CONFIRMATION_WINDOW_HOURS = 24;

// A still-active room block (any reason) running at least this many days is an
// aging/accountability alert on top of MAINTENANCE's immediate one — "is this
// still needed?" rather than "this just happened."
const BLOCK_TOO_LONG_DAYS = 3;

// An unblocked, unoccupied room with no completed stay in this many days is a
// standing revenue-loss signal, distinct from a room that's simply blocked.
const UNBOOKED_TOO_LONG_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Bookings in these statuses don't represent an actual stay — excluded from
// today's check-in/check-out/occupancy/revenue counts the same way the
// Dashboard's trend chart excludes them (DashboardService.getTrends).
const NOT_A_STAY: Prisma.BookingWhereInput['status'] = { notIn: ['CANCELLED', 'NO_SHOW', 'DRAFT'] };

export type NotificationType =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'BOOKING_CONFIRMATION'
  | 'MAINTENANCE'
  | 'DAILY_BRIEFING'
  | 'ROOM_BLOCKED_TOO_LONG'
  | 'ROOM_UNBOOKED_TOO_LONG'
  | 'TASK_NUDGE'
  | 'SERVICE_REQUEST';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  dueToday: boolean;
  /** Only set for DAILY_BRIEFING — a compact set of KPIs the frontend renders as a grid instead of `message`. */
  stats?: { label: string; value: string }[];
}

function formatInr(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} Lakh${amount >= 200000 ? 's' : ''}`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything surfaced here is derived live from existing tables (bookings,
   * room blocks) rather than a persisted notification log — there's no
   * separate write path to keep in sync, and it mirrors how DashboardService
   * already computes its alert lists on read.
   */
  async getForHotel(hotelId: string, includeRevenue: boolean, userId: string) {
    const now = new Date();
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    // "Today" is the hotel's own local calendar day, per its timezone
    // setting, not the server's UTC date.
    const todayStart = startOfDayInTimeZone(now, hotel.timezone);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const horizonEnd = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000); // today + tomorrow
    const confirmationSince = new Date(now.getTime() - CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);

    const [
      upcomingCheckIns,
      upcomingCheckOuts,
      bookingConfirmations,
      maintenanceAlerts,
      blockedTooLong,
      unbookedTooLong,
      taskNudges,
      serviceRequests,
      dailyBriefing,
    ] = await Promise.all([
      this.getUpcomingCheckIns(hotelId, todayStart, horizonEnd),
      this.getUpcomingCheckOuts(hotelId, todayStart, horizonEnd),
      this.getBookingConfirmations(hotelId, confirmationSince),
      this.getMaintenanceAlerts(hotelId, now),
      this.getBlockedTooLong(hotelId, now),
      this.getUnbookedTooLong(hotelId, now),
      this.getTaskNudges(hotelId, userId),
      this.getServiceRequestAlerts(hotelId, userId),
      this.getDailyBriefing(hotelId, todayStart, tomorrowStart, includeRevenue),
    ]);

    // The briefing is pinned to the top rather than sorted by timestamp —
    // it's the day's headline, not one more chronological event. The two
    // "too long" alerts use `now` as their timestamp (see below) so they stay
    // near the top too, rather than sinking under fresher events the longer
    // the underlying problem drags on.
    const items = [
      dailyBriefing,
      ...[
        ...upcomingCheckIns,
        ...upcomingCheckOuts,
        ...bookingConfirmations,
        ...maintenanceAlerts,
        ...blockedTooLong,
        ...unbookedTooLong,
        ...taskNudges,
        ...serviceRequests,
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    ];

    return {
      items,
      total: items.length,
      counts: {
        checkIn: upcomingCheckIns.length,
        checkOut: upcomingCheckOuts.length,
        bookingConfirmation: bookingConfirmations.length,
        maintenance: maintenanceAlerts.length,
        blockedTooLong: blockedTooLong.length,
        unbookedTooLong: unbookedTooLong.length,
        taskNudge: taskNudges.length,
        serviceRequest: serviceRequests.length,
      },
    };
  }

  /**
   * One notification per hotel per day, pinned to the top all day (its id is
   * date-stamped, so it's the same notification on every poll until midnight
   * rolls it over to a new one) — a snapshot of the day's key numbers.
   */
  private async getDailyBriefing(hotelId: string, todayStart: Date, tomorrowStart: Date, includeRevenue: boolean): Promise<NotificationItem> {
    const [totalRooms, activeToday, checkIns, checkOuts, outOfOrderRooms, maintenanceBlocks, todaysArrivals, pendingHousekeeping] =
      await Promise.all([
        this.prisma.room.count({ where: { hotelId } }),
        this.prisma.booking.findMany({
          where: {
            hotelId,
            status: NOT_A_STAY,
            checkInDate: { lt: tomorrowStart },
            checkOutDate: { gt: todayStart },
          },
          select: { bookingRooms: { select: { roomId: true, rateApplied: true } } },
        }),
        this.prisma.booking.count({ where: { hotelId, status: NOT_A_STAY, checkInDate: todayStart } }),
        this.prisma.booking.count({ where: { hotelId, status: NOT_A_STAY, checkOutDate: todayStart } }),
        this.prisma.room.count({ where: { hotelId, status: 'OUT_OF_ORDER' } }),
        this.prisma.roomBlock.findMany({
          where: { room: { hotelId }, reason: 'MAINTENANCE', startDate: { lte: todayStart }, endDate: { gt: todayStart } },
          select: { roomId: true },
        }),
        this.prisma.booking.findMany({
          where: { hotelId, status: NOT_A_STAY, checkInDate: todayStart },
          select: { guest: { select: GUEST_LOYALTY_INCLUDE } },
        }),
        this.getPendingHousekeepingCount(hotelId),
      ]);

    const occupiedRoomIds = new Set<string>();
    let expectedRevenue = 0;
    for (const booking of activeToday) {
      for (const br of booking.bookingRooms) {
        occupiedRoomIds.add(br.roomId);
        if (includeRevenue) expectedRevenue += Number(br.rateApplied);
      }
    }
    const occupancyPct = totalRooms > 0 ? Math.round((occupiedRoomIds.size / totalRooms) * 100) : 0;

    const maintenanceRoomIds = new Set(maintenanceBlocks.map((b) => b.roomId));
    const roomsUnderMaintenance = outOfOrderRooms + maintenanceRoomIds.size;

    const vipArrivals = todaysArrivals.filter((b) => getGuestLoyaltyTier(b.guest._count.bookings)?.tier === 'VIP').length;

    return {
      id: `daily-briefing-${hotelId}-${todayStart.toISOString().slice(0, 10)}`,
      type: 'DAILY_BRIEFING',
      title: "Today's Briefing",
      message: `${occupancyPct}% occupancy · ${checkIns} check-ins · ${checkOuts} check-outs`,
      timestamp: todayStart.toISOString(),
      dueToday: true,
      stats: [
        { label: "Today's Occupancy", value: `${occupancyPct}%` },
        { label: 'Check-ins', value: String(checkIns) },
        { label: 'Check-outs', value: String(checkOuts) },
        { label: 'Rooms Under Maintenance', value: String(roomsUnderMaintenance) },
        { label: 'VIP Arrivals', value: String(vipArrivals) },
        { label: 'Pending Housekeeping', value: String(pendingHousekeeping) },
        // Omitted entirely (not just masked) for roles without finance
        // visibility — same policy as the dashboard's revenue KPI.
        ...(includeRevenue ? [{ label: 'Expected Revenue', value: formatInr(expectedRevenue) }] : []),
      ],
    };
  }

  /**
   * Unlike every other item here, this one is per-viewer, not hotel-wide —
   * it only surfaces a task nudge (see HousekeepingService.nudge) to the
   * staff member it was actually aimed at, so a housekeeping login sees
   * "you were flagged," not everyone else's pings too. Stays until the task
   * is done or reassigned, since it's a still-outstanding to-do, not a
   * time-boxed alert.
   */
  private async getTaskNudges(hotelId: string, userId: string): Promise<NotificationItem[]> {
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId }, assignedToId: userId, nudgedAt: { not: null }, status: { not: 'READY' } },
      include: { room: true, nudgedBy: { select: { fullName: true } } },
      orderBy: { nudgedAt: 'desc' },
    });

    return tasks.map((t) => ({
      id: `task-nudge-${t.id}-${t.nudgedAt!.getTime()}`,
      type: 'TASK_NUDGE' as const,
      title: 'Room needs your attention',
      message: t.nudgedBy ? `Room ${t.room.roomNumber} — flagged by ${t.nudgedBy.fullName}` : `Room ${t.room.roomNumber}`,
      timestamp: t.nudgedAt!.toISOString(),
      dueToday: true,
    }));
  }

  /**
   * Also per-viewer, like getTaskNudges — a mid-stay room-service request
   * (see HousekeepingService.requestService, raised from the Rooms tab for
   * a currently occupied room) notifies whichever housekeeping staff member
   * it landed on, whether that was the auto-assign roster or a manual pick.
   * Stays until the task is done or reassigned, same as a nudge.
   */
  private async getServiceRequestAlerts(hotelId: string, userId: string): Promise<NotificationItem[]> {
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId }, assignedToId: userId, serviceRequest: true, status: { not: 'READY' } },
      include: { room: true },
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((t) => ({
      id: `service-request-${t.id}`,
      type: 'SERVICE_REQUEST' as const,
      title: 'Room service requested',
      message: `Room ${t.room.roomNumber} — guest is currently in the room`,
      timestamp: t.createdAt.toISOString(),
      dueToday: true,
    }));
  }

  // Same "latest task per room, room not currently occupied" definition HousekeepingService.findTasks uses for its board.
  private async getPendingHousekeepingCount(hotelId: string): Promise<number> {
    const latestPerRoom = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId } },
      include: { room: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
      distinct: ['roomId'],
    });
    return latestPerRoom.filter((t) => t.room.status !== 'OCCUPIED' && t.status !== 'READY').length;
  }

  // CONFIRMED bookings due to arrive today or tomorrow that haven't checked in yet.
  private async getUpcomingCheckIns(hotelId: string, todayStart: Date, horizonEnd: Date): Promise<NotificationItem[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { hotelId, status: 'CONFIRMED', checkInDate: { gte: todayStart, lt: horizonEnd } },
      include: { guest: true, bookingRooms: { include: { room: true } } },
      orderBy: { checkInDate: 'asc' },
    });

    return bookings.map((b) => {
      const dueToday = b.checkInDate.getTime() === todayStart.getTime();
      const roomNumbers = b.bookingRooms.map((br) => br.room.roomNumber).join(', ');
      return {
        id: `checkin-${b.id}`,
        type: 'CHECK_IN' as const,
        title: dueToday ? 'Check-in due today' : 'Check-in due tomorrow',
        message: `${b.guest.fullName} — room ${roomNumbers}`,
        timestamp: b.checkInDate.toISOString(),
        dueToday,
      };
    });
  }

  // CHECKED_IN bookings due to leave today or tomorrow.
  private async getUpcomingCheckOuts(hotelId: string, todayStart: Date, horizonEnd: Date): Promise<NotificationItem[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { hotelId, status: 'CHECKED_IN', checkOutDate: { gte: todayStart, lt: horizonEnd } },
      include: { guest: true, bookingRooms: { include: { room: true } } },
      orderBy: { checkOutDate: 'asc' },
    });

    return bookings.map((b) => {
      const dueToday = b.checkOutDate.getTime() === todayStart.getTime();
      const roomNumbers = b.bookingRooms.map((br) => br.room.roomNumber).join(', ');
      return {
        id: `checkout-${b.id}`,
        type: 'CHECK_OUT' as const,
        title: dueToday ? 'Check-out due today' : 'Check-out due tomorrow',
        message: `${b.guest.fullName} — room ${roomNumbers}`,
        timestamp: b.checkOutDate.toISOString(),
        dueToday,
      };
    });
  }

  // Bookings confirmed within the last CONFIRMATION_WINDOW_HOURS.
  private async getBookingConfirmations(hotelId: string, since: Date): Promise<NotificationItem[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { hotelId, status: 'CONFIRMED', createdAt: { gte: since } },
      include: { guest: true, bookingRooms: { include: { room: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => {
      const roomNumbers = b.bookingRooms.map((br) => br.room.roomNumber).join(', ');
      return {
        id: `confirmation-${b.id}`,
        type: 'BOOKING_CONFIRMATION' as const,
        title: 'Booking confirmed',
        message: `${b.guest.fullName} — room ${roomNumbers}`,
        timestamp: b.createdAt.toISOString(),
        dueToday: false,
      };
    });
  }

  // Rooms currently blocked for MAINTENANCE right now.
  private async getMaintenanceAlerts(hotelId: string, now: Date): Promise<NotificationItem[]> {
    const blocks = await this.prisma.roomBlock.findMany({
      where: { room: { hotelId }, reason: 'MAINTENANCE', startDate: { lte: now }, endDate: { gt: now } },
      include: { room: true },
      orderBy: { startDate: 'asc' },
    });

    return blocks.map((block) => ({
      id: `maintenance-${block.id}`,
      type: 'MAINTENANCE' as const,
      title: 'Room under maintenance',
      message: block.notes ? `Room ${block.room.roomNumber} — ${block.notes}` : `Room ${block.room.roomNumber}`,
      timestamp: block.startDate.toISOString(),
      dueToday: true,
    }));
  }

  // Any still-active block (maintenance, renovation, VIP hold, internal use —
  // not just MAINTENANCE) that's been running at least BLOCK_TOO_LONG_DAYS.
  // Distinct from getMaintenanceAlerts: that one fires immediately for any
  // active maintenance block; this one is an aging escalation on top of it,
  // for any reason, once it's dragged on.
  private async getBlockedTooLong(hotelId: string, now: Date): Promise<NotificationItem[]> {
    const cutoff = new Date(now.getTime() - BLOCK_TOO_LONG_DAYS * MS_PER_DAY);
    const blocks = await this.prisma.roomBlock.findMany({
      where: { room: { hotelId }, startDate: { lte: cutoff }, endDate: { gt: now } },
      include: { room: true },
      orderBy: { startDate: 'asc' },
    });

    return blocks.map((block) => {
      const daysBlocked = Math.floor((now.getTime() - block.startDate.getTime()) / MS_PER_DAY);
      return {
        id: `block-too-long-${block.id}`,
        type: 'ROOM_BLOCKED_TOO_LONG' as const,
        title: 'Room blocked too long',
        message: `Room ${block.room.roomNumber} — blocked ${daysBlocked} days (${block.reason.toLowerCase()})`,
        timestamp: now.toISOString(),
        dueToday: true,
      };
    });
  }

  /**
   * Rooms sitting idle with no completed stay in UNBOOKED_TOO_LONG_DAYS — a
   * standing revenue-loss signal distinct from a room that's blocked (those
   * are excluded here and covered by getBlockedTooLong/getMaintenanceAlerts
   * instead). Room has no `createdAt` column, so a room with zero completed
   * bookings ever is treated as idle since the epoch — always eligible once
   * the hotel has been operating long enough to have any booking history.
   */
  private async getUnbookedTooLong(hotelId: string, now: Date): Promise<NotificationItem[]> {
    const cutoff = new Date(now.getTime() - UNBOOKED_TOO_LONG_DAYS * MS_PER_DAY);

    const [rooms, activeBlocks, completedStays] = await Promise.all([
      this.prisma.room.findMany({ where: { hotelId, status: { notIn: ['OUT_OF_ORDER', 'OCCUPIED'] } } }),
      this.prisma.roomBlock.findMany({ where: { room: { hotelId }, startDate: { lte: now }, endDate: { gt: now } }, select: { roomId: true } }),
      this.prisma.bookingRoom.findMany({
        where: { room: { hotelId }, booking: { status: 'CHECKED_OUT' } },
        select: { roomId: true, booking: { select: { checkOutDate: true } } },
      }),
    ]);

    const blockedRoomIds = new Set(activeBlocks.map((b) => b.roomId));
    const lastCheckOutByRoom = new Map<string, Date>();
    for (const br of completedStays) {
      const checkOut = br.booking.checkOutDate;
      const prev = lastCheckOutByRoom.get(br.roomId);
      if (!prev || checkOut > prev) lastCheckOutByRoom.set(br.roomId, checkOut);
    }

    const alerts: NotificationItem[] = [];
    for (const room of rooms) {
      if (blockedRoomIds.has(room.id)) continue;
      const idleSince = lastCheckOutByRoom.get(room.id) ?? new Date(0);
      if (idleSince > cutoff) continue;
      const idleDays = Math.floor((now.getTime() - idleSince.getTime()) / MS_PER_DAY);
      alerts.push({
        id: `unbooked-too-long-${room.id}`,
        type: 'ROOM_UNBOOKED_TOO_LONG',
        title: 'Room unbooked too long',
        message: lastCheckOutByRoom.has(room.id) ? `Room ${room.roomNumber} — idle ${idleDays} days` : `Room ${room.roomNumber} — never booked`,
        timestamp: now.toISOString(),
        dueToday: true,
      });
    }
    return alerts;
  }
}
