import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PricingRule } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

export interface AppliedRule {
  id: string;
  name: string;
  adjustmentType: string;
  adjustmentValue: number;
  resultingRate: number;
}

type RuleInput = {
  roomTypeId?: string | null;
  adjustmentType?: string;
  adjustmentValue?: number;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: number[];
};

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForHotel(hotelId: string, roomTypeId?: string) {
    return this.prisma.pricingRule.findMany({
      where: { hotelId, ...(roomTypeId ? { roomTypeId } : {}) },
      include: { roomType: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Shared validation for both create and update — `existing` supplies the fields a partial update omits. */
  private async assertValid(
    hotelId: string,
    input: RuleInput,
    existing?: { adjustmentType: string; adjustmentValue: Prisma.Decimal; startDate: Date | null; endDate: Date | null },
  ) {
    if (input.roomTypeId) {
      const roomType = await this.prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
      if (!roomType || roomType.hotelId !== hotelId) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Room type does not belong to this hotel' });
      }
    }

    const startDate = input.startDate !== undefined ? input.startDate : existing?.startDate?.toISOString().slice(0, 10) ?? null;
    const endDate = input.endDate !== undefined ? input.endDate : existing?.endDate?.toISOString().slice(0, 10) ?? null;
    if (!!startDate !== !!endDate) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'startDate and endDate must be provided together' });
    }
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'endDate must be after startDate' });
    }

    const adjustmentType = input.adjustmentType ?? existing?.adjustmentType;
    const adjustmentValue = input.adjustmentValue ?? (existing ? Number(existing.adjustmentValue) : undefined);
    if (adjustmentType === 'PERCENTAGE' && adjustmentValue !== undefined && adjustmentValue <= -100) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A percentage adjustment of -100 or lower would zero out (or invert) the rate' });
    }
  }

  private normalizeDaysOfWeek(daysOfWeek?: number[]): number[] {
    return [...new Set(daysOfWeek ?? [])].sort((a, b) => a - b);
  }

  async create(dto: CreatePricingRuleDto) {
    await this.assertValid(dto.hotelId, dto);

    return this.prisma.pricingRule.create({
      data: {
        hotelId: dto.hotelId,
        roomTypeId: dto.roomTypeId,
        name: dto.name,
        adjustmentType: dto.adjustmentType,
        adjustmentValue: dto.adjustmentValue,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        daysOfWeek: this.normalizeDaysOfWeek(dto.daysOfWeek),
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      },
      include: { roomType: true },
    });
  }

  async update(id: string, dto: UpdatePricingRuleDto) {
    const existing = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pricing rule not found');
    if (existing.hotelId !== dto.hotelId) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Pricing rule does not belong to this hotel' });
    }

    await this.assertValid(dto.hotelId, dto, existing);

    const data: Prisma.PricingRuleUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.adjustmentType !== undefined) data.adjustmentType = dto.adjustmentType;
    if (dto.adjustmentValue !== undefined) data.adjustmentValue = dto.adjustmentValue;
    if (dto.roomTypeId !== undefined) data.roomTypeId = dto.roomTypeId;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.daysOfWeek !== undefined) data.daysOfWeek = this.normalizeDaysOfWeek(dto.daysOfWeek);
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.active !== undefined) data.active = dto.active;

    return this.prisma.pricingRule.update({ where: { id }, data, include: { roomType: true } });
  }

  async remove(id: string) {
    const existing = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pricing rule not found');
    await this.prisma.pricingRule.delete({ where: { id } });
    return { id };
  }

  private async matchingRules(hotelId: string, roomTypeId: string) {
    return this.prisma.pricingRule.findMany({
      where: {
        hotelId,
        active: true,
        OR: [{ roomTypeId }, { roomTypeId: null }],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Applies every active rule that covers `date`, lowest priority first, each on top of the previous step. */
  private applyRulesForNight(baseRate: number, rules: PricingRule[], date: Date): { rate: number; applied: AppliedRule[] } {
    const dayOfWeek = date.getUTCDay();
    let rate = baseRate;
    const applied: AppliedRule[] = [];
    for (const rule of rules) {
      if (rule.startDate && date < rule.startDate) continue;
      if (rule.endDate && date >= rule.endDate) continue;
      const days = rule.daysOfWeek as number[];
      if (days.length > 0 && !days.includes(dayOfWeek)) continue;

      const value = Number(rule.adjustmentValue);
      rate = rule.adjustmentType === 'PERCENTAGE' ? rate * (1 + value / 100) : rate + value;
      rate = Math.max(0, Math.round(rate * 100) / 100);
      applied.push({ id: rule.id, name: rule.name, adjustmentType: rule.adjustmentType, adjustmentValue: value, resultingRate: rate });
    }
    return { rate, applied };
  }

  /**
   * The rate a room type would come out to on a given date after applying
   * every active matching rule. Powers the Settings "preview a rate" tool.
   */
  async quote(params: { hotelId: string; roomTypeId: string; date: string }) {
    const roomType = await this.prisma.roomType.findUnique({ where: { id: params.roomTypeId } });
    if (!roomType || roomType.hotelId !== params.hotelId) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Room type does not belong to this hotel' });
    }

    const rules = await this.matchingRules(params.hotelId, params.roomTypeId);
    const baseRate = Number(roomType.baseRate);
    const { rate, applied } = this.applyRulesForNight(baseRate, rules, new Date(params.date));

    return { baseRate, date: params.date, adjustedRate: rate, appliedRules: applied };
  }

  /**
   * A per-night rate breakdown across [checkIn, checkOut), plus the average —
   * used to suggest a flat rate when creating/editing a booking. Bookings
   * only store one rate for the whole stay (BookingRoom.rateApplied), so a
   * stay whose nights price differently (e.g. a weekend rule mid-week stay)
   * can only be represented by an average; `blended` flags when that
   * simplification actually lost information, so the UI can warn the user.
   */
  async quoteRange(params: { hotelId: string; roomTypeId: string; checkIn: string; checkOut: string }) {
    const roomType = await this.prisma.roomType.findUnique({ where: { id: params.roomTypeId } });
    if (!roomType || roomType.hotelId !== params.hotelId) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Room type does not belong to this hotel' });
    }

    const checkIn = new Date(params.checkIn);
    const checkOut = new Date(params.checkOut);
    if (checkOut <= checkIn) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'checkOut must be after checkIn' });
    }

    const rules = await this.matchingRules(params.hotelId, params.roomTypeId);
    const baseRate = Number(roomType.baseRate);

    const nights: { date: string; rate: number }[] = [];
    for (let d = new Date(checkIn); d < checkOut; d.setUTCDate(d.getUTCDate() + 1)) {
      const { rate } = this.applyRulesForNight(baseRate, rules, new Date(d));
      nights.push({ date: d.toISOString().slice(0, 10), rate });
    }

    const averageRate = Math.round((nights.reduce((sum, n) => sum + n.rate, 0) / nights.length) * 100) / 100;
    const blended = new Set(nights.map((n) => n.rate)).size > 1;

    return { baseRate, nights, averageRate, blended };
  }
}
