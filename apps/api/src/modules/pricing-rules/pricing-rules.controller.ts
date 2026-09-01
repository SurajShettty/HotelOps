import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PricingRulesService } from './pricing-rules.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

@Controller('pricing-rules')
export class PricingRulesController {
  constructor(private readonly pricingRulesService: PricingRulesService) {}

  @Get()
  findAll(@Query('hotelId') hotelId: string, @Query('roomTypeId') roomTypeId?: string) {
    return this.pricingRulesService.findAllForHotel(hotelId, roomTypeId);
  }

  @Get('quote')
  quote(@Query('hotelId') hotelId: string, @Query('roomTypeId') roomTypeId: string, @Query('date') date: string) {
    return this.pricingRulesService.quote({ hotelId, roomTypeId, date });
  }

  @Get('quote-range')
  quoteRange(
    @Query('hotelId') hotelId: string,
    @Query('roomTypeId') roomTypeId: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.pricingRulesService.quoteRange({ hotelId, roomTypeId, checkIn, checkOut });
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post()
  create(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.pricingRulesService.create(dto, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.pricingRulesService.update(id, dto, user.id);
  }

  // `hotelId` is read as a query param purely for RolesGuard scoping, same
  // convention as DELETE /rooms/block/:id.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('hotelId') _hotelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.pricingRulesService.remove(id, user.id);
  }
}
