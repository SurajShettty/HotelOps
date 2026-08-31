import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateGuestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
