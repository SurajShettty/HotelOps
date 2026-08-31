import { Body, Controller, Post } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinDto } from './dto/checkin.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post()
  checkin(@Body() dto: CheckinDto) {
    return this.checkinService.checkin(dto);
  }
}
