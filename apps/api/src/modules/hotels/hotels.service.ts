import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, fieldDiff, snapshot } from '../audit-logs/audit-log.service';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface HotelPolicyFields {
  checkInTime?: string;
  checkOutTime?: string;
  earlyCheckInFee?: number;
  lateCheckOutFee?: number;
}

const HOTEL_FIELDS = [
  'name',
  'timezone',
  'address',
  'checkInTime',
  'checkOutTime',
  'earlyCheckInFee',
  'lateCheckOutFee',
  'logoUrl',
  'housekeepingAutoAssignEnabled',
] as const;

// PNG/JPEG only — pdfkit's doc.image() (used to place this on invoices)
// can't render WebP or SVG.
const LOGO_DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,/;
// Comfortably above a compressed logo, well below what'd bloat every hotel
// row and audit-log snapshot that includes it.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

@Injectable()
export class HotelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private assertValidPolicy(fields: HotelPolicyFields) {
    for (const [label, value] of [
      ['checkInTime', fields.checkInTime],
      ['checkOutTime', fields.checkOutTime],
    ] as const) {
      if (value !== undefined && !TIME_PATTERN.test(value)) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${label} must be in 24-hour "HH:mm" format` });
      }
    }
    for (const [label, value] of [
      ['earlyCheckInFee', fields.earlyCheckInFee],
      ['lateCheckOutFee', fields.lateCheckOutFee],
    ] as const) {
      if (value !== undefined && value < 0) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${label} cannot be negative` });
      }
    }
  }

  private assertValidLogo(logoUrl: string | null | undefined) {
    if (logoUrl === undefined || logoUrl === null) return;
    if (!LOGO_DATA_URL_PATTERN.test(logoUrl)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'logoUrl must be a PNG or JPEG data URL' });
    }
    const base64 = logoUrl.slice(logoUrl.indexOf(',') + 1);
    const approxBytes = (base64.length * 3) / 4;
    if (approxBytes > MAX_LOGO_BYTES) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Logo image must be under 2MB' });
    }
  }

  findAll() {
    return this.prisma.hotel.findMany();
  }

  findOne(id: string) {
    return this.prisma.hotel.findUniqueOrThrow({ where: { id } });
  }

  async create(
    data: {
      name: string;
      timezone?: string;
      address?: Prisma.InputJsonValue;
      logoUrl?: string;
      housekeepingAutoAssignEnabled?: boolean;
    } & HotelPolicyFields,
    actorId: string,
  ) {
    this.assertValidPolicy(data);
    this.assertValidLogo(data.logoUrl);
    const hotel = await this.prisma.hotel.create({ data });
    await this.auditLog.record(this.prisma, {
      hotelId: hotel.id,
      actorId,
      entity: 'Hotel',
      entityId: hotel.id,
      action: 'CREATE',
      after: snapshot(hotel, HOTEL_FIELDS),
    });
    return hotel;
  }

  async update(
    id: string,
    data: Partial<
      {
        name: string;
        timezone: string;
        address: Prisma.InputJsonValue;
        logoUrl: string | null;
        housekeepingAutoAssignEnabled: boolean;
      } & HotelPolicyFields
    >,
    actorId: string,
  ) {
    this.assertValidPolicy(data);
    this.assertValidLogo(data.logoUrl);
    const before = await this.prisma.hotel.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.hotel.update({ where: { id }, data });
    const diff = fieldDiff(before, after, HOTEL_FIELDS);
    await this.auditLog.record(this.prisma, {
      hotelId: id,
      actorId,
      entity: 'Hotel',
      entityId: id,
      action: 'UPDATE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  /** Revert of a Hotel UPDATE — reapplies a stored field snapshot without re-logging. */
  async restoreFields(id: string, fields: Record<string, unknown>) {
    await this.prisma.hotel.update({ where: { id }, data: fields as Prisma.HotelUpdateInput });
  }
}
