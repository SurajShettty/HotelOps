import { IsDateString } from 'class-validator';

export class UpdateRoomBlockDto {
  @IsDateString()
  endDate!: string;
}
