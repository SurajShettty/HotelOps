import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// SUPER_ADMIN is a platform-wide grant (UserHotelRole.hotelId = null) and is
// intentionally not assignable from this hotel-scoped endpoint.
export enum AssignableRoleDto {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  RECEPTIONIST = 'RECEPTIONIST',
  HOUSEKEEPING = 'HOUSEKEEPING',
  FINANCE = 'FINANCE',
}

export class CreateUserDto {
  @IsUUID()
  hotelId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(AssignableRoleDto)
  role!: AssignableRoleDto;
}
