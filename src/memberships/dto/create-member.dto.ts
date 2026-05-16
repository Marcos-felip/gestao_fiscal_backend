import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({
    example: 'João Silva',
    description: 'Nome do usuário (mínimo 2 caracteres)',
  })
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  name: string;

  @ApiProperty({
    example: 'joao@exemplo.com',
    description: 'E-mail válido do usuário',
  })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiPropertyOptional({
    enum: MembershipRole,
    default: MembershipRole.MEMBER,
    description:
      'Papel do membro (OWNER pode criar ADMIN, MEMBER pode criar apenas MEMBER)',
  })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole = MembershipRole.MEMBER;
}
