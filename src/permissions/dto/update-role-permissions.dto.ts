import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'Lista de códigos de permissão' })
  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}
