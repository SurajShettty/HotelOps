import { IsNotEmpty, IsString } from 'class-validator';

export class FlagGuestDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
