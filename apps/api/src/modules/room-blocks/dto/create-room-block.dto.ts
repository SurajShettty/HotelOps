import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum RoomBlockReasonDto {
  MAINTENANCE = 'MAINTENANCE',
  RENOVATION = 'RENOVATION',
  VIP = 'VIP',
  INTERNAL = 'INTERNAL',
}

export class CreateRoomBlockDto {
  @IsUUID()
  roomId!: string;

  @IsEnum(RoomBlockReasonDto)
  reason!: RoomBlockReasonDto;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
