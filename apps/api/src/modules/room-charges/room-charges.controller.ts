import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { RoomChargesService } from './room-charges.service';
import { CreateRoomChargeDto } from './dto/create-room-charge.dto';

@Controller('room-charges')
export class RoomChargesController {
  constructor(private readonly roomChargesService: RoomChargesService) {}

  @Get()
  findAll(@Query('bookingId') bookingId?: string, @Query('roomId') roomId?: string) {
    if (bookingId) return this.roomChargesService.findAllForBooking(bookingId);
    if (roomId) return this.roomChargesService.findAllForRoom(roomId);
    return [];
  }

  @Post()
  create(@Body() dto: CreateRoomChargeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.roomChargesService.create(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roomChargesService.remove(id);
  }
}
