import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoomsService } from './rooms.service';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  findAll(@Query('hotelId') hotelId: string, @Query('status') status?: string, @Query('roomTypeId') roomTypeId?: string) {
    return this.roomsService.findAllForHotel(hotelId, { status, roomTypeId });
  }

  @Get('availability')
  async availability(@Query() query: AvailabilityQueryDto) {
    const availableRooms = await this.availabilityService.findAvailableRooms({
      hotelId: query.hotelId,
      checkIn: new Date(query.checkIn),
      checkOut: new Date(query.checkOut),
      roomTypeId: query.roomTypeId,
      excludeBookingId: query.excludeBookingId,
    });
    return { availableRooms };
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post()
  create(@Body() body: { hotelId: string; roomTypeId: string; roomNumber: string; floor?: string }) {
    return this.roomsService.create(body);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'OUT_OF_ORDER') {
    return this.roomsService.updateStatus(id, status);
  }
}
