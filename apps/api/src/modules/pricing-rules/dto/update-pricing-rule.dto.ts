import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PriceAdjustmentTypeDto } from './create-pricing-rule.dto';

export class UpdatePricingRuleDto {
  // Required (not just for scoping RolesGuard) so the service can confirm the
  // rule actually belongs to the hotel the caller claims to be acting on.
  @IsUUID()
  hotelId!: string;

  @IsOptional()
  @IsUUID()
  roomTypeId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(PriceAdjustmentTypeDto)
  adjustmentType?: PriceAdjustmentTypeDto;

  @IsOptional()
  @IsNumber()
  adjustmentValue?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
