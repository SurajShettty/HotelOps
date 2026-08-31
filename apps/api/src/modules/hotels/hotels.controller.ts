import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { Roles } from '../../common/decorators/roles.decorator';
import { HotelsService } from './hotels.service';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  findAll() {
    return this.hotelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelsService.findOne(id);
  }

  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() body: { name: string; timezone?: string; address?: Prisma.InputJsonValue }) {
    return this.hotelsService.create(body);
  }

  // Param is named `hotelId` (not `id`) so RolesGuard can resolve it from
  // request.params.hotelId without special-casing this route.
  @Roles('SUPER_ADMIN', 'OWNER')
  @Patch(':hotelId')
  update(
    @Param('hotelId') hotelId: string,
    @Body() body: Partial<{ name: string; timezone: string; address: Prisma.InputJsonValue }>,
  ) {
    return this.hotelsService.update(hotelId, body);
  }
}
