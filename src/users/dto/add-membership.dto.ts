import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class AddUserToCompanyMembershipDto {
  @ApiProperty({ enum: MembershipRole, example: 'MEMBER' })
  @IsEnum(MembershipRole, {
    message: 'Papel deve ser um dos: OWNER, ADMIN, MEMBER',
  })
  role: MembershipRole;
}
