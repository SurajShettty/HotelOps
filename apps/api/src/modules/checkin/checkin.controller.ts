import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckinService } from './checkin.service';
import { CheckinDto } from './dto/checkin.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  // `hotelId` query param is read by RolesGuard for scoping only, same
  // convention as PATCH /rooms/:id/floor — check-in is keyed by bookingId
  // and doesn't otherwise need it.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
  @Post()
  checkin(@Body() dto: CheckinDto, @CurrentUser() user: CurrentUserPayload) {
    return this.checkinService.checkin(dto, user.id);
  }
}
