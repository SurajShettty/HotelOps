import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { todayUtcDateOnly } from '../../common/date.util';
import { CheckinDto } from './dto/checkin.dto';

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  async checkin(dto: CheckinDto) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: dto.bookingId } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== 'CONFIRMED') {
        throw new ConflictException({ code: 'INVALID_STATE', message: `Booking must be CONFIRMED to check in, got ${booking.status}` });
      }

      // Check-in stamps the booking with the guest's *actual* arrival date —
      // early or late arrivals shift the booking's checkInDate to match, so
      // billing (nights, at checkout) reflects the real stay, not the plan.
      const actualCheckIn = todayUtcDateOnly();
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

      for (const assignment of dto.roomAssignments) {
        const room = await tx.room.findUnique({
          where: { id: assignment.roomId },
          include: { housekeepingTasks: { where: { status: { not: 'READY' } }, take: 1 } },
        });
        if (!room) throw new NotFoundException(`Room ${assignment.roomId} not found`);
        if (room.status === 'DIRTY' || room.housekeepingTasks.length > 0) {
          throw new ConflictException({ code: 'ROOM_NOT_READY', message: `Room ${room.roomNumber} is not ready for check-in` });
        }

        await tx.bookingRoom.update({ where: { id: assignment.bookingRoomId }, data: { roomId: assignment.roomId } });
        await tx.room.update({ where: { id: assignment.roomId }, data: { status: 'OCCUPIED' } });
      }

      if (dto.depositAmount) {
        await tx.payment.create({
          data: { bookingId: dto.bookingId, amount: dto.depositAmount, method: 'CASH', type: 'CHARGE', reference: 'Check-in deposit' },
        });
      }

      return tx.booking.update({ where: { id: dto.bookingId }, data: { status: 'CHECKED_IN', checkInDate } });
    });
  }
}
