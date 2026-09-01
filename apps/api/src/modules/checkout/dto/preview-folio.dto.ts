import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { LineItem } from './checkout.dto';

export class PreviewFolioDto {
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

  @IsOptional()
  @IsNumber()
  taxRatePercent?: number;

  // Front desk can waive the hotel's configured late check-out fee. No effect
  // if checkout isn't actually happening late, or the hotel has no fee set.
  @IsOptional()
  @IsBoolean()
  waiveLateCheckOutFee?: boolean;
}
