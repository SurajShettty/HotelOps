import { Module } from '@nestjs/common';
import { HousekeepingController, HousekeepingFloorAssignmentsController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';

@Module({
  controllers: [HousekeepingController, HousekeepingFloorAssignmentsController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
