import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePagination } from '../../common/pagination';
import { BookingsService } from '../bookings/bookings.service';
import { GuestsService } from '../guests/guests.service';
import { RoomsService } from '../rooms/rooms.service';
import { RoomTypesService } from '../room-types/room-types.service';
import { RoomBlocksService } from '../room-blocks/room-blocks.service';
import { PricingRulesService } from '../pricing-rules/pricing-rules.service';
import { HotelsService } from '../hotels/hotels.service';
import { UsersService } from '../users/users.service';
import { RoomChargesService } from '../room-charges/room-charges.service';

type Diff = { before: Record<string, unknown> | null; after: Record<string, unknown> | null };

/** entity:action combos this dispatch table doesn't list are simply not revertible. */
type RevertHandler = (entityId: string, diff: Diff) => Promise<void>;

@Injectable()
export class AuditLogsService {
  private readonly revertHandlers: Record<string, RevertHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly guests: GuestsService,
    private readonly rooms: RoomsService,
    private readonly roomTypes: RoomTypesService,
    private readonly roomBlocks: RoomBlocksService,
    private readonly pricingRules: PricingRulesService,
    private readonly hotels: HotelsService,
    private readonly users: UsersService,
    private readonly roomCharges: RoomChargesService,
  ) {
    this.revertHandlers = {
      'Booking:CREATE': (id) => this.bookings.cancelRaw(id).then(() => undefined),
      'Booking:UPDATE': (id, diff) => this.bookings.restoreBookingDetails(id, diff.before as never).then(() => undefined),
      'Booking:CANCEL': (id) => this.bookings.uncancel(id).then(() => undefined),
      'Booking:NO_SHOW': (id) => this.bookings.uncancel(id).then(() => undefined),

      'Guest:CREATE': (id) => this.guests.removeIfNoBookings(id),
      'Guest:UPDATE': (id, diff) => this.guests.restoreFields(id, diff.before ?? {}),
      'Guest:FLAG': (id, diff) => this.guests.restoreFields(id, diff.before ?? {}),
      'Guest:UNFLAG': (id, diff) => this.guests.restoreFields(id, diff.before ?? {}),

      'Room:CREATE': (id) => this.rooms.removeIfUnreferenced(id),
      'Room:STATUS_CHANGE': (id, diff) => this.rooms.restoreFields(id, diff.before ?? {}),
      'Room:FLOOR_CHANGE': (id, diff) => this.rooms.restoreFields(id, diff.before ?? {}),

      'RoomType:CREATE': (id) => this.roomTypes.removeIfUnreferenced(id),
      'RoomType:UPDATE': (id, diff) => this.roomTypes.restoreFields(id, diff.before ?? {}),

      'RoomBlock:CREATE': (id) => this.roomBlocks.removeById(id),
      'RoomBlock:DELETE': (id, diff) => this.roomBlocks.recreate(id, diff.before as never).then(() => undefined),

      'PricingRule:CREATE': (id) => this.pricingRules.removeById(id),
      'PricingRule:UPDATE': (id, diff) => this.pricingRules.restoreFields(id, diff.before ?? {}),
      'PricingRule:DELETE': (id, diff) => this.pricingRules.recreate(id, diff.before ?? {}).then(() => undefined),

      'Hotel:UPDATE': (id, diff) => this.hotels.restoreFields(id, diff.before ?? {}),

      'UserHotelRole:ASSIGN': (id) => this.users.revokeGrantById(id),
      'UserHotelRole:REVOKE': (id, diff) => this.users.recreateGrant(id, diff.before as never).then(() => undefined),

      'RoomCharge:CREATE': (id) => this.roomCharges.removeIfNotInvoiced(id),
      'RoomCharge:DELETE': (id, diff) => this.roomCharges.recreateIfNotInvoiced(id, diff.before as never).then(() => undefined),

      'User:ACTIVATE': (id, diff) => this.users.restoreFields(id, diff.before ?? {}),
      'User:DEACTIVATE': (id, diff) => this.users.restoreFields(id, diff.before ?? {}),
    };
  }

  async findAll(opts: {
    hotelId: string;
    entity?: string;
    action?: string;
    actorId?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }) {
    const { page, pageSize, skip, take } = normalizePagination(opts.page, opts.pageSize);

    const where: Prisma.AuditLogWhereInput = {
      hotelId: opts.hotelId,
      ...(opts.entity ? { entity: opts.entity } : {}),
      ...(opts.action ? { action: opts.action } : {}),
      ...(opts.actorId ? { actorId: opts.actorId } : {}),
      ...(opts.from || opts.to
        ? {
            createdAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: {
          actor: { select: { id: true, fullName: true } },
          revertedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async revert(id: string, actorId: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Audit log entry not found');
    if (log.revertedAt) {
      throw new ConflictException({ code: 'ALREADY_REVERTED', message: 'This action has already been reverted.' });
    }

    const handler = this.revertHandlers[`${log.entity}:${log.action}`];
    if (!handler) {
      throw new BadRequestException({ code: 'NOT_REVERTIBLE', message: `${log.entity} ${log.action} actions can't be reverted.` });
    }

    const diff = log.diff as unknown as Diff;
    await handler(log.entityId, diff);

    await this.prisma.auditLog.update({ where: { id }, data: { revertedAt: new Date(), revertedById: actorId } });
    await this.prisma.auditLog.create({
      data: {
        hotelId: log.hotelId,
        actorId,
        entity: log.entity,
        entityId: log.entityId,
        action: 'REVERT',
        diff: { before: diff.after ?? null, after: diff.before ?? null } as Prisma.InputJsonValue,
      },
    });

    return { id, entity: log.entity, entityId: log.entityId, action: log.action };
  }
}
