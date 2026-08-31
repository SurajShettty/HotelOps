import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export enum BookingSourceDto {
  DIRECT = 'DIRECT',
  PHONE = 'PHONE',
  WALK_IN = 'WALK_IN',
  OTA = 'OTA',
}

export class BookingRoomInput {
  @IsUUID()
  roomId!: string;

  @IsNumber()
  rate!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  occupants?: number;
}

export class CreateBookingDto {
  @IsUUID()
  hotelId!: string;

  @IsUUID()
  guestId!: string;

  @IsDateString()
  checkInDate!: string;

  @IsDateString()
  checkOutDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingRoomInput)
  rooms!: BookingRoomInput[];

  @IsEnum(BookingSourceDto)
  source!: BookingSourceDto;
}
