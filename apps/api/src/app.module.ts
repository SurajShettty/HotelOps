import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { RoomTypesModule } from './modules/room-types/room-types.module';
import { GuestsModule } from './modules/guests/guests.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { RoomBlocksModule } from './modules/room-blocks/room-blocks.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RoomChargesModule } from './modules/room-charges/room-charges.module';
import { PricingRulesModule } from './modules/pricing-rules/pricing-rules.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HotelsModule,
    RoomsModule,
    RoomTypesModule,
    GuestsModule,
    BookingsModule,
    RoomBlocksModule,
    CheckinModule,
    CheckoutModule,
    HousekeepingModule,
    PaymentsModule,
    ReportsModule,
    DashboardModule,
    RoomChargesModule,
    PricingRulesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
