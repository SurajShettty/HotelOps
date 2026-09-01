import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// How far back a just-created booking still counts as a fresh "confirmation" notification.
const CONFIRMATION_WINDOW_HOURS = 24;

export type NotificationType = 'CHECK_IN' | 'CHECK_OUT' | 'BOOKING_CONFIRMATION' | 'MAINTENANCE';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  dueToday: boolean;
}

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
  async getForHotel(hotelId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const horizonEnd = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000); // today + tomorrow
    const confirmationSince = new Date(now.getTime() - CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);

    const [upcomingCheckIns, upcomingCheckOuts, bookingConfirmations, maintenanceAlerts] = await Promise.all([
      this.getUpcomingCheckIns(hotelId, todayStart, horizonEnd),
      this.getUpcomingCheckOuts(hotelId, todayStart, horizonEnd),
      this.getBookingConfirmations(hotelId, confirmationSince),
      this.getMaintenanceAlerts(hotelId, now),
    ]);

    const items = [...upcomingCheckIns, ...upcomingCheckOuts, ...bookingConfirmations, ...maintenanceAlerts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      items,
      total: items.length,
      counts: {
        checkIn: upcomingCheckIns.length,
        checkOut: upcomingCheckOuts.length,
        bookingConfirmation: bookingConfirmations.length,
        maintenance: maintenanceAlerts.length,
      },
    };
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
}
