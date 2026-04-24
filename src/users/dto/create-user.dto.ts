import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength, IsUUID } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'joao@exemplo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: MembershipRole, example: 'MEMBER' })
  @IsEnum(MembershipRole)
  role: MembershipRole;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  companyId: string;
}
