import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PreviewFolioDto } from './dto/preview-folio.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewFolioDto) {
    return this.checkoutService.preview(dto);
  }

  @Post()
  checkout(@Body() dto: CheckoutDto) {
    return this.checkoutService.checkout(dto);
  }
}
