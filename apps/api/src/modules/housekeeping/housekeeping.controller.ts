import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { HousekeepingService } from './housekeeping.service';

@Controller('housekeeping/tasks')
export class HousekeepingController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @Get()
  findTasks(@Query('hotelId') hotelId: string, @Query('status') status?: string) {
    return this.housekeepingService.findTasks(hotelId, status);
  }

  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @Body() body: { status?: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY'; assignedToId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.housekeepingService.updateTask(id, body, user.id);
  }
}
