import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class LineItem {
  @IsString()
  description!: string;

  @IsNumber()
  amount!: number;
}

export enum PaymentMethodDto {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
}

export class CheckoutDto {
  @IsUUID()
  bookingId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItem)
  additionalCharges?: LineItem[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItem)
  discounts?: LineItem[];

  @IsEnum(PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;

  @IsNumber()
  paymentAmount!: number;

  @IsOptional()
  @IsNumber()
  taxRatePercent?: number;

  @IsOptional()
  @IsBoolean()
  waiveLateCheckOutFee?: boolean;
}
