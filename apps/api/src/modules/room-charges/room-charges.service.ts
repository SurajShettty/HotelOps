import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomChargeDto } from './dto/create-room-charge.dto';

@Injectable()
export class RoomChargesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff log a charge by room number; this resolves it to whichever stay is actually occupying that room right now. */
  private async findActiveBookingId(roomId: string): Promise<string> {
    const bookingRoom = await this.prisma.bookingRoom.findFirst({
      where: { roomId, booking: { status: 'CHECKED_IN' } },
      select: { bookingId: true },
    });
    if (!bookingRoom) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'This room has no guest currently checked in' });
    }
    return bookingRoom.bookingId;
  }

  async create(dto: CreateRoomChargeDto, addedById: string) {
    const bookingId = await this.findActiveBookingId(dto.roomId);
    return this.prisma.roomCharge.create({
      data: { bookingId, description: dto.description, amount: dto.amount, addedById },
      include: { addedBy: { select: { fullName: true } } },
    });
  }

  findAllForBooking(bookingId: string) {
    return this.prisma.roomCharge.findMany({
      where: { bookingId },
      include: { addedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForRoom(roomId: string) {
    const bookingRoom = await this.prisma.bookingRoom.findFirst({
      where: { roomId, booking: { status: 'CHECKED_IN' } },
      select: { bookingId: true },
    });
    if (!bookingRoom) return [];
    return this.findAllForBooking(bookingRoom.bookingId);
  }

  async remove(id: string) {
    const charge = await this.prisma.roomCharge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Room charge not found');
    await this.prisma.roomCharge.delete({ where: { id } });
  }
}
