import { Module } from '@nestjs/common';
import { RoomChargesController } from './room-charges.controller';
import { RoomChargesService } from './room-charges.service';

@Module({
  controllers: [RoomChargesController],
  providers: [RoomChargesService],
})
export class RoomChargesModule {}
