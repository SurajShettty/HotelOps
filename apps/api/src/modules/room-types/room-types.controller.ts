import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoomTypesService } from './room-types.service';

@Controller('room-types')
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  findAll(@Query('hotelId') hotelId: string) {
    return this.roomTypesService.findAllForHotel(hotelId);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post()
  create(
    @Body()
    body: {
      hotelId: string;
      name: string;
      baseOccupancy?: number;
      maxOccupancy?: number;
      baseRate: number;
      amenities?: Prisma.InputJsonValue;
    },
  ) {
    return this.roomTypesService.create(body);
  }

  // `hotelId` in the body is read by RolesGuard for scoping only (this route's
  // param is the room type id, not a hotel id); the service update ignores it.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      hotelId: string;
      name?: string;
      baseRate?: number;
      baseOccupancy?: number;
      maxOccupancy?: number;
      amenities?: Prisma.InputJsonValue;
    },
  ) {
    const { hotelId: _hotelId, ...data } = body;
    return this.roomTypesService.update(id, data);
  }
}
