import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoomBlocksService } from './room-blocks.service';
import { CreateRoomBlockDto } from './dto/create-room-block.dto';

@Controller('rooms/block')
export class RoomBlocksController {
  constructor(private readonly roomBlocksService: RoomBlocksService) {}

  // NB: the request body must include `hotelId` (alongside roomId) for RolesGuard
  // to resolve which hotel this action is scoped to — CreateRoomBlockDto doesn't
  // declare it since RoomBlock itself has no hotelId column, but the guard reads
  // the raw body before validation strips unknown fields.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Post()
  create(@Body() dto: CreateRoomBlockDto, @CurrentUser() user: CurrentUserPayload) {
    return this.roomBlocksService.create(dto, user.id);
  }

  @Get()
  findAllForRoom(@Query('roomId') roomId: string) {
    return this.roomBlocksService.findAllForRoom(roomId);
  }

  // `hotelId` is read as a query param purely for RolesGuard scoping (RoomBlock
  // has no hotelId column of its own) — same convention as the POST route above.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('hotelId') _hotelId: string) {
    return this.roomBlocksService.remove(id);
  }
}
