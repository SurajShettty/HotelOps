import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, snapshot } from '../audit-logs/audit-log.service';
import { CreateRoomChargeDto } from './dto/create-room-charge.dto';

const CHARGE_FIELDS = ['bookingId', 'description', 'amount', 'addedById'] as const;

@Injectable()
export class RoomChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

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
    const charge = await this.prisma.roomCharge.create({
      data: { bookingId, description: dto.description, amount: dto.amount, addedById },
      include: { addedBy: { select: { fullName: true } }, booking: { select: { hotelId: true } } },
    });
    await this.auditLog.record(this.prisma, {
      hotelId: charge.booking.hotelId,
      actorId: addedById,
      entity: 'RoomCharge',
      entityId: charge.id,
      action: 'CREATE',
      after: snapshot(charge, CHARGE_FIELDS),
    });
    return charge;
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

  async remove(id: string, actorId: string) {
    const charge = await this.prisma.roomCharge.findUnique({ where: { id }, include: { booking: { select: { hotelId: true } } } });
    if (!charge) throw new NotFoundException('Room charge not found');
    await this.prisma.roomCharge.delete({ where: { id } });
    await this.auditLog.record(this.prisma, {
      hotelId: charge.booking.hotelId,
      actorId,
      entity: 'RoomCharge',
      entityId: id,
      action: 'DELETE',
      before: snapshot(charge, CHARGE_FIELDS),
    });
  }

  /** True once the parent booking has an Invoice — a checked-out stay's charges are frozen into that folio. */
  private async isInvoiced(bookingId: string): Promise<boolean> {
    const invoice = await this.prisma.invoice.findUnique({ where: { bookingId }, select: { id: true } });
    return !!invoice;
  }

  /** Revert of a RoomCharge CREATE — refuses once the booking has already been invoiced. */
  async removeIfNotInvoiced(id: string) {
    const charge = await this.prisma.roomCharge.findUnique({ where: { id } });
    if (!charge) return;
    if (await this.isInvoiced(charge.bookingId)) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: 'This charge has already been invoiced and can no longer be removed.' });
    }
    await this.prisma.roomCharge.delete({ where: { id } });
  }

  /** Revert of a RoomCharge DELETE — refuses once the booking has already been invoiced. */
  async recreateIfNotInvoiced(id: string, fields: { bookingId: string; description: string; amount: number; addedById: string }) {
    if (await this.isInvoiced(fields.bookingId)) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: 'This booking has already been invoiced; the charge can no longer be restored.' });
    }
    return this.prisma.roomCharge.create({ data: { id, ...fields } });
  }
}
