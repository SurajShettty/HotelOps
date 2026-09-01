import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Query('hotelId') hotelId: string) {
    return this.dashboardService.getSummary(hotelId);
  }

  @Get('trends')
  getTrends(@Query('hotelId') hotelId: string, @Query('days') days?: string) {
    return this.dashboardService.getTrends(hotelId, days ? Number(days) : 7);
  }
}
