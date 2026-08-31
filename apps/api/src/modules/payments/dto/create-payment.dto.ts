import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export enum PaymentMethodDto {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
}

export class CreatePaymentDto {
  @IsUUID()
  bookingId!: string;

  @IsNumber()
  amount!: number;

  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class RefundPaymentDto {
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
