import { Module } from '@nestjs/common';
import { RoomBlocksController } from './room-blocks.controller';
import { RoomBlocksService } from './room-blocks.service';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  controllers: [RoomBlocksController],
  providers: [RoomBlocksService],
  exports: [RoomBlocksService],
})
export class RoomBlocksModule {}
