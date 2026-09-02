import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GuestsService } from './guests.service';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { FlagGuestDto } from './dto/flag-guest.dto';
import { VerifyGuestIdDto } from './dto/verify-guest-id.dto';

@Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
@Controller('guests')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  findAll(
    @Query('hotelId') hotelId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.guestsService.findAllForHotel(hotelId, { search, page, pageSize });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.guestsService.findOneWithHistory(id);
  }

  @Post()
  create(@Body() dto: CreateGuestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.guestsService.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGuestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.guestsService.update(id, dto, user.id);
  }

  @Post(':id/flag')
  flag(@Param('id') id: string, @Body() dto: FlagGuestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.guestsService.flag(id, dto, user.id);
  }

  @Post(':id/unflag')
  unflag(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.guestsService.unflag(id, user.id);
  }

  @Post(':id/verify-id')
  verifyId(@Param('id') id: string, @Body() dto: VerifyGuestIdDto, @CurrentUser() user: CurrentUserPayload) {
    return this.guestsService.verifyId(id, dto, user.id);
  }
}
