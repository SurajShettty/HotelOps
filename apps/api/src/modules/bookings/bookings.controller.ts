import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';
import { ChangeRoomBookingDto } from './dto/change-room-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll(
    @Query('hotelId') hotelId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('roomNumber') roomNumber?: string,
    @Query('floor') floor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('arrivingOn') arrivingOn?: string,
    @Query('departingOn') departingOn?: string,
    @Query('onDate') onDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookingsService.findAllForHotel(hotelId, {
      status,
      search,
      roomNumber,
      floor,
      from,
      to,
      arrivingOn,
      departingOn,
      onDate,
      page,
      pageSize,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.create(dto, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.update(id, dto, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post(':id/extend')
  extend(@Param('id') id: string, @Body() dto: ExtendBookingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.extend(id, dto, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post(':id/change-room')
  changeRoom(@Param('id') id: string, @Body() dto: ChangeRoomBookingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.changeRoom(id, dto, user.id);
  }

  // `hotelId` query param is read by RolesGuard for scoping only, same
  // convention as PATCH /rooms/:id/floor — cancel/no-show look the booking
  // up by id and don't otherwise need it.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.cancel(id, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post(':id/no-show')
  noShow(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.bookingsService.noShow(id, user.id);
  }
}
