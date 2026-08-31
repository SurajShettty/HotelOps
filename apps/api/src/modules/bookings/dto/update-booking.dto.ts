import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { BookingRoomInput } from './create-booking.dto';

export class UpdateBookingDto {
  // Required (not just for scoping RolesGuard) so the service can confirm the
  // booking actually belongs to the hotel the caller claims to be acting on.
  @IsUUID()
  hotelId!: string;

  @IsOptional()
  @IsDateString()
  checkInDate?: string;

  @IsOptional()
  @IsDateString()
  checkOutDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingRoomInput)
  rooms?: BookingRoomInput[];
}
