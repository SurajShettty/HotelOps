import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { CheckinService } from './checkin.service';
import { CheckinDto } from './dto/checkin.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post()
  checkin(@Body() dto: CheckinDto, @CurrentUser() user: CurrentUserPayload) {
    return this.checkinService.checkin(dto, user.id);
  }
}
