import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, RefundPaymentDto } from './dto/create-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.create(dto, user.id);
  }

  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundPaymentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.refund(id, dto, user.id);
  }
}
