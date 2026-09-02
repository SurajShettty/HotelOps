import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class RoomConflictQueryDto {
  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @IsUUID()
  excludeBookingId?: string;
}
