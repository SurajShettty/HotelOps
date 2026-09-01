import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ChangeRoomBookingDto {
  // Required (not just for scoping RolesGuard) so the service can confirm the
  // booking actually belongs to the hotel the caller claims to be acting on.
  @IsUUID()
  hotelId!: string;

  // Which room-in-booking is being changed — a booking can hold several rooms.
  @IsUUID()
  bookingRoomId!: string;

  @IsUUID()
  newRoomId!: string;

  @IsNumber()
  @Min(0.01)
  newRate!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
