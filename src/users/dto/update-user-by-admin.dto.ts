import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserByAdminDto {
  @ApiPropertyOptional({
    example: 'João Silva',
    description: 'Nome do usuário (mínimo 2 caracteres)',
  })
  @IsOptional()
  @IsString({ message: 'Nome deve ser uma string' })
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'joao@exemplo.com',
    description: 'E-mail do usuário',
  })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;
}
