import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { RoomsModule } from '../rooms/rooms.module';
import { HousekeepingModule } from '../housekeeping/housekeeping.module';

@Module({
  imports: [RoomsModule, HousekeepingModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
