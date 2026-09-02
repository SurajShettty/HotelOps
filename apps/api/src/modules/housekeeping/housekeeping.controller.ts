import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { HousekeepingService } from './housekeeping.service';

@Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING')
@Controller('housekeeping/tasks')
export class HousekeepingController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @Get()
  findTasks(@Query('hotelId') hotelId: string, @Query('status') status?: string) {
    return this.housekeepingService.findTasks(hotelId, status);
  }

  // `hotelId` query param is read by RolesGuard for scoping only, same
  // convention as PATCH /rooms/:id/floor — task update is keyed by task id
  // and doesn't otherwise need it.
  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @Body() body: { status?: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY'; assignedToId?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.housekeepingService.updateTask(id, body, user.id);
  }

  // Narrower than the controller's class-level @Roles — the people who'd
  // realistically chase an overdue task (front desk needing a room, or
  // management) rather than housekeeping nudging itself.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post(':id/nudge')
  nudge(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.housekeepingService.nudge(id, user.id);
  }

  // Also narrower than the class-level @Roles — front desk is who'd field a
  // guest's in-room request (housekeeping gets assigned the resulting task,
  // it doesn't raise it for itself).
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post('service-request')
  requestService(@Body() body: { hotelId: string; roomId: string; priority?: number }, @CurrentUser() user: CurrentUserPayload) {
    return this.housekeepingService.requestService(body.hotelId, body.roomId, user.id, body.priority);
  }
}

// Narrow, purpose-built directory for the assignee dropdown on the
// Housekeeping board — separate from GET /users (full profiles, every role,
// management-only) so RECEPTIONIST/HOUSEKEEPING can populate it themselves.
@Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING')
@Controller('housekeeping/staff')
export class HousekeepingStaffController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @Get()
  list(@Query('hotelId') hotelId: string) {
    return this.housekeepingService.listAssignableStaff(hotelId);
  }
}

// The staff-per-floor roster that Hotel.housekeepingAutoAssignEnabled reads
// from — a separate resource/controller since it's config, not a task.
@Controller('housekeeping/floor-assignments')
export class HousekeepingFloorAssignmentsController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'HOUSEKEEPING')
  @Get()
  list(@Query('hotelId') hotelId: string) {
    return this.housekeepingService.listFloorAssignments(hotelId);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post()
  upsert(@Body() body: { hotelId: string; floor: string; userId: string }) {
    return this.housekeepingService.upsertFloorAssignment(body.hotelId, body.floor, body.userId);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('hotelId') hotelId: string) {
    return this.housekeepingService.removeFloorAssignment(id, hotelId);
  }
}
