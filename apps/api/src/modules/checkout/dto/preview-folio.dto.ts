import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsUUID, ValidateNested } from 'class-validator';
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
}
