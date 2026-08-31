import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto, RefundPaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePaymentDto) {
    return this.prisma.payment.create({
      data: { bookingId: dto.bookingId, amount: dto.amount, method: dto.method, type: 'CHARGE', reference: dto.reference },
    });
  }

  async refund(paymentId: string, dto: RefundPaymentDto) {
    const original = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!original) throw new NotFoundException('Payment not found');

    return this.prisma.payment.create({
      data: {
        bookingId: original.bookingId,
        amount: dto.amount,
        method: original.method,
        type: 'REFUND',
        reference: dto.reason ?? `Refund of payment ${paymentId}`,
      },
    });
  }
}
