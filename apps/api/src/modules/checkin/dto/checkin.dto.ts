import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsUUID, ValidateNested } from 'class-validator';

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
}
