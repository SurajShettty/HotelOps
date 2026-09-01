import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('occupancy')
  occupancy(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.occupancy(hotelId, new Date(from), new Date(to));
  }

  @Get('revenue')
  revenue(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.revenue(hotelId, new Date(from), new Date(to));
  }

  @Get('bookings')
  bookings(
    @Query('hotelId') hotelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reportsService.bookings(hotelId, new Date(from), new Date(to), page, pageSize);
  }

  @Get('cancellations')
  cancellations(
    @Query('hotelId') hotelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reportsService.cancellations(hotelId, new Date(from), new Date(to), page, pageSize);
  }

  @Get('housekeeping')
  housekeeping(
    @Query('hotelId') hotelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reportsService.housekeeping(hotelId, new Date(from), new Date(to), page, pageSize);
  }

  @Get('housekeeping/by-staff')
  housekeepingByStaff(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.housekeepingByStaff(hotelId, new Date(from), new Date(to));
  }
}
