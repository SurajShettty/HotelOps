import { IsEnum, IsUUID } from 'class-validator';
import { AssignableRoleDto } from './create-user.dto';

export class AssignRoleDto {
  @IsUUID()
  hotelId!: string;

  @IsEnum(AssignableRoleDto)
  role!: AssignableRoleDto;
}
