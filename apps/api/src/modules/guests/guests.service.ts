import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePagination, PaginatedResult } from '../../common/pagination';
import { AuditLogService, fieldDiff, snapshot } from '../audit-logs/audit-log.service';
import { COUNTED_BOOKING_STATUSES, getGuestLoyaltyTier } from './guest-loyalty';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { FlagGuestDto } from './dto/flag-guest.dto';
import { VerifyGuestIdDto } from './dto/verify-guest-id.dto';

const GUEST_FIELDS = ['fullName', 'email', 'phone', 'idDocumentType', 'idDocumentNumber', 'notes'] as const;
const FLAG_FIELDS = ['isFlagged', 'flagReason', 'flaggedAt', 'flaggedById'] as const;
// Shared with CheckinService, which is the other place these fields get
// written — one field list so the audit diff for an 'ID_VERIFY' action is
// identical regardless of which flow triggered it.
export const ID_VERIFICATION_FIELDS = ['idDocumentType', 'idDocumentNumber', 'idDocumentUrl', 'idVerifiedAt', 'idVerifiedById'] as const;

type GuestWithBookingsCount = Prisma.GuestGetPayload<{ include: { _count: { select: { bookings: true } } } }>;

function withLoyaltyBadge<T extends { _count: { bookings: number } }>(guest: T) {
  const { _count, ...rest } = guest;
  return { ...rest, bookingsCount: _count.bookings, loyaltyBadge: getGuestLoyaltyTier(_count.bookings) };
}

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAllForHotel(
    hotelId: string,
    opts: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<ReturnType<typeof withLoyaltyBadge<GuestWithBookingsCount>>>> {
    const { page, pageSize, skip, take } = normalizePagination(opts.page, opts.pageSize);

    const where: Prisma.GuestWhereInput = {
      hotelId,
      ...(opts.search
        ? {
            OR: [
              { fullName: { contains: opts.search, mode: 'insensitive' } },
              { email: { contains: opts.search, mode: 'insensitive' } },
              { phone: { contains: opts.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.guest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { bookings: { where: { status: COUNTED_BOOKING_STATUSES } } } },
          flaggedBy: { select: { fullName: true } },
        },
      }),
      this.prisma.guest.count({ where }),
    ]);

    return { items: items.map(withLoyaltyBadge), total, page, pageSize };
  }

  async findOneWithHistory(id: string) {
    const guest = await this.prisma.guest.findUnique({
      where: { id },
      include: {
        bookings: {
          orderBy: { checkInDate: 'desc' },
          include: { bookingRooms: { include: { room: { select: { roomNumber: true } } } } },
        },
        _count: { select: { bookings: { where: { status: COUNTED_BOOKING_STATUSES } } } },
        flaggedBy: { select: { fullName: true } },
      },
    });
    if (!guest) throw new NotFoundException('Guest not found');
    return withLoyaltyBadge(guest);
  }

  async create(data: CreateGuestDto, actorId: string) {
    const guest = await this.prisma.guest.create({ data });
    await this.auditLog.record(this.prisma, {
      hotelId: guest.hotelId,
      actorId,
      entity: 'Guest',
      entityId: guest.id,
      action: 'CREATE',
      after: snapshot(guest, GUEST_FIELDS),
    });
    return guest;
  }

  async update(id: string, data: UpdateGuestDto, actorId: string) {
    const before = await this.prisma.guest.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.guest.update({ where: { id }, data });
    const diff = fieldDiff(before, after, GUEST_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId,
      entity: 'Guest',
      entityId: id,
      action: 'UPDATE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  async flag(id: string, dto: FlagGuestDto, staffId: string) {
    const before = await this.prisma.guest.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.guest.update({
      where: { id },
      data: { isFlagged: true, flagReason: dto.reason, flaggedAt: new Date(), flaggedById: staffId },
    });
    const diff = fieldDiff(before, after, FLAG_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId: staffId,
      entity: 'Guest',
      entityId: id,
      action: 'FLAG',
      before: diff.before,
      after: diff.after,
    });
    return this.findOneWithHistory(id);
  }

  async unflag(id: string, actorId: string) {
    const before = await this.prisma.guest.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.guest.update({
      where: { id },
      data: { isFlagged: false, flagReason: null, flaggedAt: null, flaggedById: null },
    });
    const diff = fieldDiff(before, after, FLAG_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId,
      entity: 'Guest',
      entityId: id,
      action: 'UNFLAG',
      before: diff.before,
      after: diff.after,
    });
    return this.findOneWithHistory(id);
  }

  /**
   * Confirms the ID document on file for this guest — either what's already
   * there (see the Bookings tab's verify popover, no body needed), or
   * freshly captured in the same action when there's nothing on file yet
   * (the popover's upload form, dto carries the new type/number/photo).
   * Refuses if, after merging in whatever `dto` supplies, any of the three
   * fields still isn't set — there's nothing to verify.
   */
  async verifyId(id: string, dto: VerifyGuestIdDto, staffId: string) {
    const before = await this.prisma.guest.findUniqueOrThrow({ where: { id } });
    const idDocumentType = dto.idDocumentType ?? before.idDocumentType;
    const idDocumentNumber = dto.idDocumentNumber ?? before.idDocumentNumber;
    const idDocumentUrl = dto.idDocumentUrl ?? before.idDocumentUrl;
    if (!idDocumentType || !idDocumentNumber || !idDocumentUrl) {
      throw new BadRequestException({
        code: 'NO_ID_ON_FILE',
        message: 'Enter the ID document type, number, and upload a photo/scan to verify.',
      });
    }
    const after = await this.prisma.guest.update({
      where: { id },
      data: { idDocumentType, idDocumentNumber, idDocumentUrl, idVerifiedAt: new Date(), idVerifiedById: staffId },
    });
    const diff = fieldDiff(before, after, ID_VERIFICATION_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: after.hotelId,
      actorId: staffId,
      entity: 'Guest',
      entityId: id,
      action: 'ID_VERIFY',
      before: diff.before,
      after: diff.after,
    });
    return this.findOneWithHistory(id);
  }

  /** Revert of a Guest CREATE — refuses if the guest has since picked up any bookings. */
  async removeIfNoBookings(id: string) {
    const bookingsCount = await this.prisma.booking.count({ where: { guestId: id } });
    if (bookingsCount > 0) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: 'This guest already has bookings and can no longer be removed.' });
    }
    await this.prisma.guest.delete({ where: { id } });
  }

  /** Revert of Guest UPDATE/FLAG/UNFLAG — reapplies a stored field snapshot without re-logging. */
  async restoreFields(id: string, fields: Record<string, unknown>) {
    await this.prisma.guest.update({ where: { id }, data: fields as Prisma.GuestUpdateInput });
  }
}
