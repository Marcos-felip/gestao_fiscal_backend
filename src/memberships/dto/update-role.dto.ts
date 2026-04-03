import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({ enum: MembershipRole })
  @IsEnum(MembershipRole)
  role: MembershipRole;
}
