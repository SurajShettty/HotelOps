import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Occupancy + revenue + revenue/detailed are fetched together for the
  // merged "Revenue & Occupancy" report tab, so all three share one role
  // set — RECEPTIONIST now also sees revenue figures here (previously
  // FINANCE-only) and FINANCE now also sees occupancy (previously
  // RECEPTIONIST-only), a deliberate widening for that merged view.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'FINANCE')
  @Get('occupancy')
  occupancy(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.occupancy(hotelId, new Date(from), new Date(to));
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'FINANCE')
  @Get('revenue')
  revenue(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.revenue(hotelId, new Date(from), new Date(to));
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'FINANCE')
  @Get('revenue/detailed')
  revenueDetailed(
    @Query('hotelId') hotelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reportsService.revenueDetailed(hotelId, new Date(from), new Date(to), page, pageSize);
  }

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'HOUSEKEEPING')
  @Get('housekeeping/by-staff')
  housekeepingByStaff(@Query('hotelId') hotelId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.housekeepingByStaff(hotelId, new Date(from), new Date(to));
  }
}
