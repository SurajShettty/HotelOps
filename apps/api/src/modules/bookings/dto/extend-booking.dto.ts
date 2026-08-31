import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ExtendBookingDto {
  // Required (not just for scoping RolesGuard) so the service can confirm the
  // booking actually belongs to the hotel the caller claims to be acting on.
  @IsUUID()
  hotelId!: string;

  @IsDateString()
  checkOutDate!: string;

  // Omit to extend in the current room; set to move the guest to a different
  // room for the extended stay (e.g. their room isn't free but another is).
  @IsOptional()
  @IsUUID()
  roomId?: string;
}
