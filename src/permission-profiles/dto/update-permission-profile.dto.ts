import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePermissionProfileDto {
  @ApiPropertyOptional({
    example: 'Estoquista',
    description: 'Nome do perfil (único dentro da empresa)',
  })
  @IsOptional()
  @IsString({ message: 'Nome deve ser uma string' })
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(60, { message: 'Nome deve ter no máximo 60 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'Acesso a produtos e movimentações de estoque',
    description: 'Descrição do perfil (envie vazio para limpar)',
  })
  @IsOptional()
  @IsString({ message: 'Descrição deve ser uma string' })
  @MaxLength(255, { message: 'Descrição deve ter no máximo 255 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['products.list', 'stock.create'],
    description:
      'Substitui integralmente os códigos de permissão do perfil quando enviado',
  })
  @IsOptional()
  @IsArray({ message: 'permissionCodes deve ser uma lista' })
  @IsString({ each: true, message: 'Cada código de permissão deve ser texto' })
  permissionCodes?: string[];
}
