import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Get()
  findAll(
    @Query('hotelId') hotelId: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditLogsService.findAll({ hotelId, entity, action, actorId, from, to, page, pageSize });
  }

  // `hotelId` is read as a query param purely for RolesGuard scoping (a
  // revert targets one logged entity, not a hotel-scoped resource of its
  // own) — same convention as DELETE /rooms/block/:id.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post(':id/revert')
  revert(@Param('id') id: string, @Query('hotelId') _hotelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.auditLogsService.revert(id, user.id);
  }
}
