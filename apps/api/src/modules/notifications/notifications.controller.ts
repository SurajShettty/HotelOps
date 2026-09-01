import { Controller, Get, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getForHotel(@Query('hotelId') hotelId: string) {
    return this.notificationsService.getForHotel(hotelId);
  }
}
