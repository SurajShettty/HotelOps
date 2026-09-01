import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { addDaysUtc, differenceInCalendarDays, localTimeHHmm, todayUtcDateOnly } from '../../common/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutDto, LineItem } from './dto/checkout.dto';
import { PreviewFolioDto } from './dto/preview-folio.dto';

const DEFAULT_TAX_RATE_PERCENT = 12;

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shared by both the live checkout transaction and the read-only preview,
   * so "what you see while filling the form" is guaranteed to match "what
   * checkout actually charges" — no separate calculation to drift out of sync.
   */
  private async computeFolio(
    client: Prisma.TransactionClient,
    bookingId: string,
    additionalCharges: LineItem[] = [],
    discounts: LineItem[] = [],
    taxRatePercent?: number,
    waiveLateCheckOutFee = false,
  ) {
    const booking = await client.booking.findUnique({
      where: { id: bookingId },
      include: { bookingRooms: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CHECKED_IN') {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Booking must be CHECKED_IN to check out, got ${booking.status}` });
    }

    // Checkout stamps the *actual* departure date — a guest who stays past
    // the originally booked checkOutDate is billed for the real nights, not
    // just the plan. Floor at one night even for a same-day departure.
    const today = todayUtcDateOnly();
    const minCheckOut = addDaysUtc(booking.checkInDate, 1);
    const actualCheckOut = today > minCheckOut ? today : minCheckOut;

    const nights = differenceInCalendarDays(actualCheckOut, booking.checkInDate);
    const roomSubtotal = booking.bookingRooms.reduce((sum, br) => sum + Number(br.rateApplied) * nights, 0);

    // Incidentals logged during the stay (see RoomChargesModule) are folded
    // into the same total as any one-off charge typed in at checkout — the
    // receptionist doesn't need to re-enter what housekeeping already logged.
    const loggedCharges = await client.roomCharge.findMany({ where: { bookingId } });
    const loggedChargesTotal = loggedCharges.reduce((sum, c) => sum + Number(c.amount), 0);
    const chargesTotal = loggedChargesTotal + additionalCharges.reduce((sum, c) => sum + c.amount, 0);
    const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);

    // Late check-out fee: is *this moment* — the actual wall-clock time
    // checkout is being processed, regardless of what actualCheckOut's date
    // floor above works out to — past the hotel's standard check-out time?
    const hotel = await client.hotel.findUniqueOrThrow({ where: { id: booking.hotelId } });
    const lateCheckOutApplicable = localTimeHHmm(new Date(), hotel.timezone) > hotel.checkOutTime;
    const lateCheckOutFee = lateCheckOutApplicable && !waiveLateCheckOutFee ? Number(hotel.lateCheckOutFee) : 0;

    const subtotal = roomSubtotal + chargesTotal + lateCheckOutFee - discountTotal;
    const taxRate = taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT;
    const taxTotal = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;

    const alreadyPaidAgg = await client.payment.aggregate({
      where: { bookingId, type: 'CHARGE' },
      _sum: { amount: true },
    });
    const alreadyPaid = Number(alreadyPaidAgg._sum.amount ?? 0);
    // A deposit (or other prior charge) can exceed what's actually owed once
    // the final folio is known — e.g. an early departure — in which case
    // nothing is due and the excess is owed back to the guest instead.
    const balanceDue = Math.max(0, Math.round((grandTotal - alreadyPaid) * 100) / 100);
    const refundDue = Math.max(0, Math.round((alreadyPaid - grandTotal) * 100) / 100);

    return {
      booking,
      actualCheckOut,
      nights,
      roomSubtotal,
      chargesTotal,
      discountTotal,
      lateCheckOutApplicable,
      lateCheckOutFee,
      lateCheckOutTime: hotel.checkOutTime,
      subtotal,
      taxRate,
      taxTotal,
      grandTotal,
      alreadyPaid,
      balanceDue,
      refundDue,
    };
  }

  async preview(dto: PreviewFolioDto) {
    const { booking, ...folio } = await this.computeFolio(
      this.prisma,
      dto.bookingId,
      dto.additionalCharges,
      dto.discounts,
      dto.taxRatePercent,
      dto.waiveLateCheckOutFee,
    );
    return folio;
  }

  async checkout(dto: CheckoutDto) {
    return this.prisma.$transaction(async (tx) => {
      const {
        booking,
        actualCheckOut,
        nights,
        roomSubtotal,
        chargesTotal,
        lateCheckOutFee,
        subtotal,
        taxRate,
        discountTotal,
        taxTotal,
        grandTotal,
        alreadyPaid,
      } = await this.computeFolio(tx, dto.bookingId, dto.additionalCharges, dto.discounts, dto.taxRatePercent, dto.waiveLateCheckOutFee);

      const paidSoFar = alreadyPaid + dto.paymentAmount;
      if (paidSoFar < grandTotal) {
        throw new HttpException(
          { code: 'PAYMENT_INCOMPLETE', message: `Balance due: ${(grandTotal - paidSoFar).toFixed(2)}` },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      await tx.payment.create({
        data: { bookingId: booking.id, amount: dto.paymentAmount, method: dto.paymentMethod, type: 'CHARGE' },
      });

      const invoice = await tx.invoice.create({
        data: {
          bookingId: booking.id,
          nights,
          roomSubtotal,
          chargesTotal,
          lateCheckOutFee,
          // Ad-hoc line items typed in at this checkout — logged RoomCharges
          // stay queryable by bookingId on their own and aren't duplicated here.
          additionalCharges: (dto.additionalCharges ?? []) as unknown as Prisma.InputJsonValue,
          discounts: (dto.discounts ?? []) as unknown as Prisma.InputJsonValue,
          subtotal,
          taxRatePercent: taxRate,
          taxTotal,
          discountTotal,
          grandTotal,
        },
      });

      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CHECKED_OUT', checkOutDate: actualCheckOut } });

      for (const br of booking.bookingRooms) {
        await tx.room.update({ where: { id: br.roomId }, data: { status: 'DIRTY' } });
        await tx.housekeepingTask.create({ data: { roomId: br.roomId, status: 'DIRTY', priority: 1 } });
      }

      return invoice;
    });
  }
}
