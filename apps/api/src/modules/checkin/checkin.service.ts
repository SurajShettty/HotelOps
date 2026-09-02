import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { todayDateOnlyInTimeZone, localTimeHHmm } from '../../common/date.util';
import { AuditLogService, fieldDiff } from '../audit-logs/audit-log.service';
import { AvailabilityService } from '../rooms/availability.service';
import { CheckinDto } from './dto/checkin.dto';

const ID_VERIFICATION_FIELDS = ['idDocumentType', 'idDocumentNumber', 'idVerifiedAt', 'idVerifiedById'] as const;

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async checkin(dto: CheckinDto, checkedInById: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: dto.bookingId } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== 'CONFIRMED') {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking must be CONFIRMED to check in, got ${booking.status}` });
      }

      const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: booking.hotelId } });

      // Check-in stamps the booking with the guest's *actual* arrival date —
      // early or late arrivals shift the booking's checkInDate to match, so
      // billing (nights, at checkout) reflects the real stay, not the plan.
      // "Actual" is the hotel's own local calendar date, not the server's UTC one.
      const actualCheckIn = todayDateOnlyInTimeZone(hotel.timezone);
      let checkInDate = booking.checkInDate;
      if (actualCheckIn.getTime() !== booking.checkInDate.getTime()) {
        if (actualCheckIn >= booking.checkOutDate) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: `Today (${actualCheckIn.toISOString().slice(0, 10)}) is on or after the booked check-out date (${booking.checkOutDate.toISOString().slice(0, 10)}). Edit the booking's dates before checking in.`,
          });
        }
        checkInDate = actualCheckIn;
      }

      // An early arrival widens the reserved range back from the booked
      // checkInDate to today, which can now overlap something else on the
      // calendar for this room. A conflicting BOOKING is a real
      // double-booking — Postgres's own EXCLUDE constraint on booking_rooms
      // would refuse it regardless, so this still fails fast with a
      // friendly error. A conflicting room BLOCK (VIP hold, maintenance,
      // etc.) has no such cross-table constraint against bookings, and is
      // just an operational hold — the room is genuinely free to check into
      // right now, so front desk can go ahead and plan to move the guest
      // before the block starts. That's only true if the block doesn't
      // cover the check-in day itself, in which case the room can't be
      // occupied at all yet and it's a hard block like any other.
      const roomBlockWarnings: { roomId: string; blockStartDate: string; reason: string }[] = [];
      for (const assignment of dto.roomAssignments) {
        const conflict = await this.availabilityService.findRoomConflict(
          { roomId: assignment.roomId, checkIn: checkInDate, checkOut: booking.checkOutDate, excludeBookingId: dto.bookingId },
          tx,
        );
        if (conflict.bookingConflict) {
          throw new ConflictException({ code: 'ROOM_UNAVAILABLE', message: 'One or more rooms are already booked for part of this stay.' });
        }
        if (conflict.block) {
          if (conflict.block.startDate <= checkInDate) {
            throw new ConflictException({ code: 'ROOM_UNAVAILABLE', message: 'One or more rooms are blocked for the requested dates.' });
          }
          roomBlockWarnings.push({
            roomId: assignment.roomId,
            blockStartDate: conflict.block.startDate.toISOString().slice(0, 10),
            reason: conflict.block.reason,
          });
        }
      }

      for (const assignment of dto.roomAssignments) {
        const room = await tx.room.findUnique({
          where: { id: assignment.roomId },
          include: { housekeepingTasks: { where: { status: { not: 'READY' } }, take: 1 } },
        });
        if (!room) throw new NotFoundException(`Room ${assignment.roomId} not found`);
        if (room.status === 'DIRTY' || room.status === 'OCCUPIED' || room.housekeepingTasks.length > 0) {
          throw new ConflictException({ code: 'ROOM_NOT_READY', message: `Room ${room.roomNumber} is not ready for check-in` });
        }

        await tx.bookingRoom.update({ where: { id: assignment.bookingRoomId }, data: { roomId: assignment.roomId } });
        await tx.room.update({ where: { id: assignment.roomId }, data: { status: 'OCCUPIED' } });
      }

      if (dto.idDocumentType !== undefined || dto.idDocumentNumber !== undefined || dto.idVerified !== undefined) {
        const guestBefore = await tx.guest.findUniqueOrThrow({ where: { id: booking.guestId } });
        const guestAfter = await tx.guest.update({
          where: { id: booking.guestId },
          data: {
            ...(dto.idDocumentType !== undefined ? { idDocumentType: dto.idDocumentType } : {}),
            ...(dto.idDocumentNumber !== undefined ? { idDocumentNumber: dto.idDocumentNumber } : {}),
            ...(dto.idVerified
              ? { idVerifiedAt: new Date(), idVerifiedById: checkedInById }
              : dto.idVerified === false
                ? { idVerifiedAt: null, idVerifiedById: null }
                : {}),
          },
        });
        const guestDiff = fieldDiff(guestBefore, guestAfter, ID_VERIFICATION_FIELDS);
        await this.auditLog.record(tx, {
          hotelId: booking.hotelId,
          actorId: checkedInById,
          entity: 'Guest',
          entityId: booking.guestId,
          action: 'ID_VERIFY',
          before: guestDiff.before,
          after: guestDiff.after,
        });
      }

      if (dto.depositAmount) {
        await tx.payment.create({
          data: { bookingId: dto.bookingId, amount: dto.depositAmount, method: 'CASH', type: 'CHARGE', reference: 'Check-in deposit' },
        });
      }

      // Early check-in fee: is the moment this check-in is being performed
      // (not the booked date, the actual wall-clock time) before the hotel's
      // standard check-in time? Logged as a RoomCharge so it flows into the
      // checkout folio the same way any other incidental does.
      const isEarly = localTimeHHmm(new Date(), hotel.timezone) < hotel.checkInTime;
      if (isEarly && Number(hotel.earlyCheckInFee) > 0 && !dto.waiveEarlyCheckInFee) {
        await tx.roomCharge.create({
          data: {
            bookingId: dto.bookingId,
            description: `Early check-in fee (before ${hotel.checkInTime})`,
            amount: hotel.earlyCheckInFee,
            addedById: checkedInById,
          },
        });
      }

      const updated = await tx.booking.update({
        where: { id: dto.bookingId },
        data: { status: 'CHECKED_IN', checkInDate, checkedInAt: new Date() },
      });

      await this.auditLog.record(tx, {
        hotelId: booking.hotelId,
        actorId: checkedInById,
        entity: 'Booking',
        entityId: dto.bookingId,
        action: 'CHECK_IN',
        before: { status: booking.status, checkInDate: booking.checkInDate.toISOString().slice(0, 10) },
        after: { status: updated.status, checkInDate: updated.checkInDate.toISOString().slice(0, 10) },
      });

      return { ...updated, roomBlockWarnings };
    });
  }
}
