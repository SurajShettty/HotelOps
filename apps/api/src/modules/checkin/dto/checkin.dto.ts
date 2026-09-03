import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from 'class-validator';

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

  // Required — a booking can't be checked in without collecting a deposit.
  @IsNumber()
  @IsPositive()
  depositAmount!: number;

  // Front desk can waive the hotel's configured early check-in fee for this
  // arrival (e.g. loyalty guest, room was ready anyway). No effect if the
  // arrival isn't actually early, or the hotel has no fee configured.
  @IsOptional()
  @IsBoolean()
  waiveEarlyCheckInFee?: boolean;

  // ID document captured/corrected at the front desk during check-in —
  // required to check in at all (either freshly entered, or the guest's
  // existing document reused from a prior stay). Saved to the guest record
  // regardless of verification; idVerified additionally stamps who confirmed
  // it and when.
  @IsString()
  @IsNotEmpty()
  idDocumentType!: string;

  @IsString()
  @IsNotEmpty()
  idDocumentNumber!: string;

  // Data URL of the uploaded document photo/scan — see Guest.idDocumentUrl.
  @IsString()
  @IsNotEmpty()
  idDocumentUrl!: string;

  @IsOptional()
  @IsBoolean()
  idVerified?: boolean;
}
