import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsUUID, ValidateNested } from 'class-validator';

class RoomAssignmentInput {
  @IsUUID()
  bookingRoomId!: string;

  @IsUUID()
  roomId!: string;
}

export class CheckinDto {
  @IsUUID()
  bookingId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoomAssignmentInput)
  roomAssignments!: RoomAssignmentInput[];

  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  // Front desk can waive the hotel's configured early check-in fee for this
  // arrival (e.g. loyalty guest, room was ready anyway). No effect if the
  // arrival isn't actually early, or the hotel has no fee configured.
  @IsOptional()
  @IsBoolean()
  waiveEarlyCheckInFee?: boolean;
}
