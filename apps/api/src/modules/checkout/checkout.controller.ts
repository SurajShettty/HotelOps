import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PreviewFolioDto } from './dto/preview-folio.dto';

// `hotelId` query param on these routes is read by RolesGuard for scoping
// only, same convention as PATCH /rooms/:id/floor — both are keyed by
// bookingId and don't otherwise need it.
@Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewFolioDto) {
    return this.checkoutService.preview(dto);
  }

  @Post()
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: CurrentUserPayload) {
    return this.checkoutService.checkout(dto, user.id);
  }
}
