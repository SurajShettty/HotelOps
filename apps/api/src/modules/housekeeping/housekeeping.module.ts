import { Module } from '@nestjs/common';
import { HousekeepingController, HousekeepingFloorAssignmentsController, HousekeepingStaffController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';

@Module({
  controllers: [HousekeepingController, HousekeepingStaffController, HousekeepingFloorAssignmentsController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
