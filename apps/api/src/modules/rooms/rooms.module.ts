import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { AvailabilityService } from './availability.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, AvailabilityService],
  exports: [AvailabilityService],
})
export class RoomsModule {}
