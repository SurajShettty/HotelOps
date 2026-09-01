import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Get()
  findAll(@Query('hotelId') hotelId: string) {
    return this.usersService.findAllForHotel(hotelId);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Post(':id/roles')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(id, dto);
  }

  // `hotelId` is read as a query param purely for RolesGuard scoping, same
  // convention as DELETE /rooms/block/:id and DELETE /pricing-rules/:id.
  @Roles('SUPER_ADMIN', 'OWNER')
  @Delete('roles/:grantId')
  revokeRole(@Param('grantId') grantId: string, @Query('hotelId') _hotelId: string) {
    return this.usersService.revokeRole(grantId);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Patch(':id/status')
  setActive(@Param('id') id: string, @Body() body: { hotelId: string; isActive: boolean }) {
    return this.usersService.setActive(id, body.isActive);
  }
}
