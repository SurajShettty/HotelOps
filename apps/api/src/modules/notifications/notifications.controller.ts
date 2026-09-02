import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { FINANCE_VISIBLE_ROLES } from '../dashboard/dashboard.controller';
import { UsersService } from '../users/users.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  // Open to all staff for its operational alerts (arrivals, maintenance,
  // housekeeping) — only the daily briefing's "Expected Revenue" stat is
  // gated, same policy and role set as the dashboard's revenue KPI.
  @Get()
  async getForHotel(@Query('hotelId') hotelId: string, @CurrentUser() user: CurrentUserPayload) {
    const canSeeRevenue = await this.usersService.hasAnyRoleForHotel(user.id, hotelId, FINANCE_VISIBLE_ROLES);
    return this.notificationsService.getForHotel(hotelId, canSeeRevenue, user.id);
  }
}
