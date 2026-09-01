import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum PriceAdjustmentTypeDto {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export class CreatePricingRuleDto {
  @IsUUID()
  hotelId!: string;

  // Omit to apply to every room type at the hotel.
  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(PriceAdjustmentTypeDto)
  adjustmentType!: PriceAdjustmentTypeDto;

  // Signed — negative discounts the rate. Validated against -100 (PERCENTAGE)
  // in the service, since class-validator can't see adjustmentType here.
  @IsNumber()
  adjustmentValue!: number;

  // Provide both or neither — a one-sided range is rejected in the service.
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // 0 (Sun) .. 6 (Sat). Omit or leave empty for "every day".
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
