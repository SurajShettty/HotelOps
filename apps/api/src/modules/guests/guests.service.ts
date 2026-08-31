import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePagination, PaginatedResult } from '../../common/pagination';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForHotel(
    hotelId: string,
    opts: { search?: string; page?: string; pageSize?: string },
  ): Promise<PaginatedResult<Prisma.GuestGetPayload<object>>> {
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
      this.prisma.guest.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.guest.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOneWithHistory(id: string) {
    const guest = await this.prisma.guest.findUnique({
      where: { id },
      include: { bookings: { orderBy: { checkInDate: 'desc' } } },
    });
    if (!guest) throw new NotFoundException('Guest not found');
    return guest;
  }

  create(data: {
    hotelId: string;
    fullName: string;
    email?: string;
    phone?: string;
    idDocumentType?: string;
    idDocumentNumber?: string;
    notes?: string;
  }) {
    return this.prisma.guest.create({ data });
  }

  update(id: string, data: Partial<{ fullName: string; email: string; phone: string; notes: string }>) {
    return this.prisma.guest.update({ where: { id }, data });
  }
}
