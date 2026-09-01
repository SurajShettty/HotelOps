import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, fieldDiff, snapshot } from '../audit-logs/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

const GRANT_FIELDS = ['userId', 'hotelId', 'roleId'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Every role grant held by `userId` — platform-wide (hotelId null) and hotel-scoped. Powers `GET /users/me/roles`. */
  async findGrantsForUser(userId: string) {
    const grants = await this.prisma.userHotelRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return grants.map((g) => ({ hotelId: g.hotelId, role: g.role.name }));
  }

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

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A user with this email already exists' });
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        userHotelRoles: { create: { hotelId: dto.hotelId, roleId: role.id } },
      },
      include: { userHotelRoles: { include: { role: true } } },
    });
    await this.auditLog.record(this.prisma, {
      hotelId: dto.hotelId,
      actorId,
      entity: 'User',
      entityId: user.id,
      action: 'CREATE',
      after: { email: user.email, fullName: user.fullName, phone: user.phone, role: dto.role },
    });
    return user;
  }

  async assignRole(userId: string, dto: AssignRoleDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    const existing = await this.prisma.userHotelRole.findFirst({ where: { userId, hotelId: dto.hotelId, roleId: role.id } });
    if (existing) return existing;

    const grant = await this.prisma.userHotelRole.create({ data: { userId, hotelId: dto.hotelId, roleId: role.id } });
    await this.auditLog.record(this.prisma, {
      hotelId: dto.hotelId,
      actorId,
      entity: 'UserHotelRole',
      entityId: grant.id,
      action: 'ASSIGN',
      after: snapshot(grant, GRANT_FIELDS),
    });
    return grant;
  }

  async revokeRole(grantId: string, actorId: string) {
    const grant = await this.prisma.userHotelRole.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Role grant not found');
    await this.prisma.userHotelRole.delete({ where: { id: grantId } });
    await this.auditLog.record(this.prisma, {
      hotelId: grant.hotelId,
      actorId,
      entity: 'UserHotelRole',
      entityId: grantId,
      action: 'REVOKE',
      before: snapshot(grant, GRANT_FIELDS),
    });
  }

  async setActive(id: string, isActive: boolean, actorId: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({ where: { id }, data: { isActive } });
    const diff = fieldDiff(before, after, ['isActive'] as const);
    await this.auditLog.record(this.prisma, {
      hotelId: null,
      actorId,
      entity: 'User',
      entityId: id,
      action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
      before: diff.before,
      after: diff.after,
    });
    return after;
  }

  /** Revert of a UserHotelRole ASSIGN — plain delete, no audit entry of its own. */
  async revokeGrantById(grantId: string) {
    const grant = await this.prisma.userHotelRole.findUnique({ where: { id: grantId } });
    if (!grant) return;
    await this.prisma.userHotelRole.delete({ where: { id: grantId } });
  }

  /** Revert of a UserHotelRole REVOKE — recreates the grant with the same id and fields. */
  async recreateGrant(id: string, fields: { userId: string; hotelId: string | null; roleId: string }) {
    return this.prisma.userHotelRole.create({ data: { id, ...fields } });
  }

  /** Revert of a User ACTIVATE/DEACTIVATE — reapplies a stored field snapshot without re-logging. */
  async restoreFields(id: string, fields: Record<string, unknown>) {
    await this.prisma.user.update({ where: { id }, data: fields });
  }
}
