import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RoleName } from '../../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { DashboardService } from './dashboard.service';

export const FINANCE_VISIBLE_ROLES: RoleName[] = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'FINANCE'];

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly usersService: UsersService,
  ) {}

  // RECEPTIONIST/HOUSEKEEPING need this dashboard for its operational alerts
  // (arrivals, overdue housekeeping, overstays) but shouldn't see revenue —
  // so this only gates the financial fields, not the whole endpoint.
  @Get('summary')
  async getSummary(@Query('hotelId') hotelId: string, @CurrentUser() user: CurrentUserPayload) {
    const canSeeRevenue = await this.usersService.hasAnyRoleForHotel(user.id, hotelId, FINANCE_VISIBLE_ROLES);
    return this.dashboardService.getSummary(hotelId, canSeeRevenue);
  }

  @Get('trends')
  async getTrends(@Query('hotelId') hotelId: string, @Query('days') days: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    const canSeeRevenue = await this.usersService.hasAnyRoleForHotel(user.id, hotelId, FINANCE_VISIBLE_ROLES);
    return this.dashboardService.getTrends(hotelId, days ? Number(days) : 7, canSeeRevenue);
  }
}
