import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY, RoleName } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Authenticated user required');
    }

    const grants = await this.prisma.userHotelRole.findMany({
      where: { userId },
      include: { role: true },
    });

    if (grants.some((g) => g.hotelId === null && g.role.name === 'SUPER_ADMIN')) {
      return true;
    }

    const hotelId: string | undefined = request.params?.hotelId ?? request.query?.hotelId ?? request.body?.hotelId;
    if (!hotelId) {
      throw new ForbiddenException('This action requires a platform-wide role');
    }

    const hasRole = grants.some((g) => g.hotelId === hotelId && requiredRoles.includes(g.role.name as RoleName));
    if (!hasRole) {
      throw new ForbiddenException(`Requires one of: ${requiredRoles.join(', ')} for this hotel`);
    }

    return true;
  }
}
