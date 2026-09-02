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
