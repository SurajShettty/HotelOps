import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreatePaymentDto, RefundPaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreatePaymentDto, actorId: string) {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: dto.bookingId } });
    const payment = await this.prisma.payment.create({
      data: { bookingId: dto.bookingId, amount: dto.amount, method: dto.method, type: 'CHARGE', reference: dto.reference },
    });
    await this.auditLog.record(this.prisma, {
      hotelId: booking.hotelId,
      actorId,
      entity: 'Payment',
      entityId: payment.id,
      action: 'CREATE',
      after: { bookingId: payment.bookingId, amount: Number(payment.amount), method: payment.method, reference: payment.reference },
    });
    return payment;
  }

  async refund(paymentId: string, dto: RefundPaymentDto, actorId: string) {
    const original = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: { select: { hotelId: true } } } });
    if (!original) throw new NotFoundException('Payment not found');

    const refund = await this.prisma.payment.create({
      data: {
        bookingId: original.bookingId,
        amount: dto.amount,
        method: original.method,
        type: 'REFUND',
        reference: dto.reason ?? `Refund of payment ${paymentId}`,
      },
    });
    await this.auditLog.record(this.prisma, {
      hotelId: original.booking.hotelId,
      actorId,
      entity: 'Payment',
      entityId: refund.id,
      action: 'REFUND',
      after: { bookingId: refund.bookingId, amount: Number(refund.amount), method: refund.method, reference: refund.reference, originalPaymentId: paymentId },
    });
    return refund;
  }
}
