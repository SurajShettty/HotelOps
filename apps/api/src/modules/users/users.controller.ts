import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Any authenticated user can see their own role grants — this is what the
  // frontend uses to decide what to show (e.g. the Audit Logs nav item),
  // unlike GET / below which lists everyone at a hotel and needs a role.
  @Get('me/roles')
  myRoles(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.findGrantsForUser(user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER')
  @Get()
  findAll(@Query('hotelId') hotelId: string) {
    return this.usersService.findAllForHotel(hotelId);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.create(dto, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Post(':id/roles')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.assignRole(id, dto, user.id);
  }

  // `hotelId` is read as a query param purely for RolesGuard scoping, same
  // convention as DELETE /rooms/block/:id and DELETE /pricing-rules/:id.
  @Roles('SUPER_ADMIN', 'OWNER')
  @Delete('roles/:grantId')
  revokeRole(@Param('grantId') grantId: string, @Query('hotelId') _hotelId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.revokeRole(grantId, user.id);
  }

  @Roles('SUPER_ADMIN', 'OWNER')
  @Patch(':id/status')
  setActive(@Param('id') id: string, @Body() body: { hotelId: string; isActive: boolean }, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.setActive(id, body.isActive, user.id);
  }
}
