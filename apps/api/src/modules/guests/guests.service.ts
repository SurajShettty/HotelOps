import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePagination, PaginatedResult } from '../../common/pagination';
import { COUNTED_BOOKING_STATUSES, getGuestLoyaltyTier } from './guest-loyalty';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';

type GuestWithBookingsCount = Prisma.GuestGetPayload<{ include: { _count: { select: { bookings: true } } } }>;

function withLoyaltyBadge<T extends { _count: { bookings: number } }>(guest: T) {
  const { _count, ...rest } = guest;
  return { ...rest, bookingsCount: _count.bookings, loyaltyBadge: getGuestLoyaltyTier(_count.bookings) };
}

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

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
        include: { _count: { select: { bookings: { where: { status: COUNTED_BOOKING_STATUSES } } } } },
      }),
      this.prisma.guest.count({ where }),
    ]);

    return { items: items.map(withLoyaltyBadge), total, page, pageSize };
  }

  async findOneWithHistory(id: string) {
    const guest = await this.prisma.guest.findUnique({
      where: { id },
      include: {
        bookings: { orderBy: { checkInDate: 'desc' } },
        _count: { select: { bookings: { where: { status: COUNTED_BOOKING_STATUSES } } } },
      },
    });
    if (!guest) throw new NotFoundException('Guest not found');
    return withLoyaltyBadge(guest);
  }

  create(data: CreateGuestDto) {
    return this.prisma.guest.create({ data });
  }

  update(id: string, data: UpdateGuestDto) {
    return this.prisma.guest.update({ where: { id }, data });
  }
}
