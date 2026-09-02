import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, RefundPaymentDto } from './dto/create-payment.dto';

// `hotelId` query param on these routes is read by RolesGuard for scoping
// only, same convention as PATCH /rooms/:id/floor — payments are keyed by
// bookingId/paymentId and don't otherwise need it.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'FINANCE')
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.create(dto, user.id);
  }

  // Refunds reverse money already collected — a higher bar than taking a
  // payment, so RECEPTIONIST is deliberately excluded here.
  @Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'FINANCE')
  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundPaymentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.refund(id, dto, user.id);
  }
}
