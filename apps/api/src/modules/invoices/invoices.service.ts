import { Injectable, NotFoundException } from '@nestjs/common';
// Plain `import PDFDocument from 'pdfkit'` type-checks (allowSyntheticDefaultImports)
// but compiles to a `.default` access that doesn't exist on pdfkit's CJS export
// (esModuleInterop is off project-wide) — this form is the correct runtime-safe one.
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../prisma/prisma.service';
import { localTimeHHmm } from '../../common/date.util';

interface InvoiceLineItem {
  description: string;
  amount: number;
}

function money(n: number | string | { toString(): string }) {
  return Number(n.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Strips characters that are invalid (or awkward) in a downloaded filename on Windows/macOS/Linux. */
function sanitizeFilenamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async findWithDetail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            hotel: true,
            guest: true,
            bookingRooms: { include: { room: true } },
            roomCharges: { orderBy: { createdAt: 'asc' } },
            payments: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findOne(id: string) {
    return this.findWithDetail(id);
  }

  /** Renders the invoice to a PDF buffer, entirely from what's persisted on the Invoice row — no re-derivation. */
  async generatePdf(id: string): Promise<{ filename: string; buffer: Buffer }> {
    const invoice = await this.findWithDetail(id);
    const { booking } = invoice;
    const additionalCharges = invoice.additionalCharges as unknown as InvoiceLineItem[];
    const discounts = invoice.discounts as unknown as InvoiceLineItem[];

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const logoMatch = booking.hotel.logoUrl?.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/);
    const headerTop = doc.y;
    const nameX = logoMatch ? 108 : 50;
    if (logoMatch) {
      doc.image(Buffer.from(logoMatch[1], 'base64'), 50, headerTop, { fit: [50, 50] });
    }
    doc.fontSize(18).text(booking.hotel.name, nameX, headerTop, { width: 495 - (nameX - 50) });
    doc.x = 50;
    doc.y = Math.max(doc.y, headerTop + (logoMatch ? 50 : 0));
    doc.moveDown(0.2);
    doc.fontSize(20).text('Invoice', { align: 'right' });
    doc.fontSize(9).fillColor('#666').text(`Invoice #${invoice.id.slice(0, 8).toUpperCase()}`, { align: 'right' });
    doc.text(`Issued ${invoice.issuedAt.toISOString().slice(0, 10)}`, { align: 'right' });
    doc.fillColor('#000');
    doc.moveDown(1);

    doc.fontSize(11).text(`Guest: ${booking.guest.fullName}`);
    if (booking.guest.email) doc.fontSize(9).fillColor('#666').text(booking.guest.email);
    if (booking.guest.phone) doc.fontSize(9).fillColor('#666').text(booking.guest.phone);
    doc.fillColor('#000');
    doc.moveDown(0.5);

    const roomNumbers = booking.bookingRooms.map((br) => br.room.roomNumber).join(', ');
    doc.fontSize(10).text(`Room ${roomNumbers}`);
    // Times (when known — a booking that never actually checked in has
    // neither) are the hotel's own local wall-clock, same as the early/late
    // fee logic in Checkin/CheckoutService, not the server's UTC.
    const checkInTime = booking.checkedInAt ? localTimeHHmm(booking.checkedInAt, booking.hotel.timezone) : null;
    const checkOutTime = booking.checkedOutAt ? localTimeHHmm(booking.checkedOutAt, booking.hotel.timezone) : null;
    doc.text(
      `${booking.checkInDate.toISOString().slice(0, 10)}${checkInTime ? ` ${checkInTime}` : ''} to ` +
        `${booking.checkOutDate.toISOString().slice(0, 10)}${checkOutTime ? ` ${checkOutTime}` : ''} ` +
        `(${invoice.nights} night${invoice.nights === 1 ? '' : 's'})`,
    );
    doc.moveDown(1);

    function row(label: string, amount: string, opts: { bold?: boolean; date?: string } = {}) {
      doc.fontSize(opts.bold ? 11 : 10).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      const y = doc.y;
      doc.text(label, 50, y, { width: 280 });
      if (opts.date) {
        doc.fontSize(8).fillColor('#666').text(opts.date, 335, y + 1, { width: 60 });
        doc.fillColor('#000').fontSize(opts.bold ? 11 : 10);
      }
      doc.text(amount, 400, y, { width: 145, align: 'right' });
      doc.moveDown(0.4);
      doc.font('Helvetica');
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    // Ad-hoc additionalCharges/the late fee/discounts are typed in at
    // checkout itself and have no date of their own — invoice.issuedAt (the
    // checkout moment) is the accurate date for all of them. A logged
    // RoomCharge, by contrast, was added at whatever point during the stay
    // it actually happened, so it keeps its own createdAt.
    const checkoutDateStr = invoice.issuedAt.toISOString().slice(0, 10);
    row(`Room charges (${invoice.nights} night${invoice.nights === 1 ? '' : 's'})`, money(invoice.roomSubtotal));
    for (const charge of booking.roomCharges) {
      row(charge.description, money(charge.amount), { date: charge.createdAt.toISOString().slice(0, 10) });
    }
    for (const item of additionalCharges) row(item.description, money(item.amount), { date: checkoutDateStr });
    if (Number(invoice.lateCheckOutFee) > 0) row('Late check-out fee', money(invoice.lateCheckOutFee), { date: checkoutDateStr });
    for (const item of discounts) row(item.description, `-${money(item.amount)}`, { date: checkoutDateStr });

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    row('Subtotal', money(invoice.subtotal));
    row(`Tax (${Number(invoice.taxRatePercent)}%)`, money(invoice.taxTotal));
    doc.moveDown(0.2);
    row('Grand total', money(invoice.grandTotal), { bold: true });

    if (booking.payments.length > 0) {
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica-Bold').text('Payments');
      doc.font('Helvetica');
      for (const payment of booking.payments) {
        const sign = payment.type === 'REFUND' ? '-' : '';
        row(`${payment.method} ${payment.type === 'REFUND' ? 'refund' : 'payment'}`, `${sign}${money(payment.amount)}`);
      }
    }

    doc.end();
    const buffer = await done;
    const guestName = sanitizeFilenamePart(booking.guest.fullName) || 'Guest';
    const checkIn = booking.checkInDate.toISOString().slice(0, 10);
    const checkOut = booking.checkOutDate.toISOString().slice(0, 10);
    return { filename: `${guestName}_${checkIn}_${checkOut}.pdf`, buffer };
  }
}
