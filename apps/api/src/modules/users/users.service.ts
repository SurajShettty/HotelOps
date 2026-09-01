import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Staff at `hotelId` — anyone holding a role grant scoped to this hotel,
   * plus platform-wide SUPER_ADMINs (hotelId = null on their grant) since
   * they can act on every hotel. Each user is listed once with all of their
   * role grants relevant to this hotel.
   */
  async findAllForHotel(hotelId: string) {
    const grants = await this.prisma.userHotelRole.findMany({
      where: { OR: [{ hotelId }, { hotelId: null }] },
      include: { user: true, role: true },
      orderBy: { user: { fullName: 'asc' } },
    });

    const byUser = new Map<string, { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; roles: { grantId: string; role: string; hotelWide: boolean }[] }>();
    for (const grant of grants) {
      if (!byUser.has(grant.userId)) {
        byUser.set(grant.userId, {
          id: grant.user.id,
          email: grant.user.email,
          fullName: grant.user.fullName,
          phone: grant.user.phone,
          isActive: grant.user.isActive,
          roles: [],
        });
      }
      byUser.get(grant.userId)!.roles.push({ grantId: grant.id, role: grant.role.name, hotelWide: grant.hotelId === null });
    }
    return Array.from(byUser.values());
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A user with this email already exists' });
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        userHotelRoles: { create: { hotelId: dto.hotelId, roleId: role.id } },
      },
      include: { userHotelRoles: { include: { role: true } } },
    });
  }

  async assignRole(userId: string, dto: AssignRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    const existing = await this.prisma.userHotelRole.findFirst({ where: { userId, hotelId: dto.hotelId, roleId: role.id } });
    if (existing) return existing;

    return this.prisma.userHotelRole.create({ data: { userId, hotelId: dto.hotelId, roleId: role.id } });
  }

  async revokeRole(grantId: string) {
    const grant = await this.prisma.userHotelRole.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Role grant not found');
    await this.prisma.userHotelRole.delete({ where: { id: grantId } });
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }
}
