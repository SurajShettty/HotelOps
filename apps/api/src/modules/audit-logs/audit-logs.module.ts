import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { GuestsModule } from '../guests/guests.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomTypesModule } from '../room-types/room-types.module';
import { RoomBlocksModule } from '../room-blocks/room-blocks.module';
import { PricingRulesModule } from '../pricing-rules/pricing-rules.module';
import { HotelsModule } from '../hotels/hotels.module';
import { UsersModule } from '../users/users.module';
import { RoomChargesModule } from '../room-charges/room-charges.module';

// @Global so AuditLogService (the recorder used from every mutating service)
// doesn't need to be imported module-by-module — same pattern as PrismaModule.
// AuditLogsService (the list/revert orchestrator) additionally needs the
// domain services below to dispatch reverts to; none of those modules import
// this one back, so there's no cycle.
@Global()
@Module({
  imports: [
    BookingsModule,
    GuestsModule,
    RoomsModule,
    RoomTypesModule,
    RoomBlocksModule,
    PricingRulesModule,
    HotelsModule,
    UsersModule,
    RoomChargesModule,
  ],
  controllers: [AuditLogsController],
  providers: [AuditLogService, AuditLogsService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}
