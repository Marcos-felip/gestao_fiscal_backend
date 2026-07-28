import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePermissionProfileDto {
  @ApiProperty({
    example: 'Estoquista',
    description: 'Nome do perfil (único dentro da empresa)',
  })
  @IsString({ message: 'Nome deve ser uma string' })
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(60, { message: 'Nome deve ter no máximo 60 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'Acesso a produtos e movimentações de estoque',
    description: 'Descrição do perfil',
  })
  @IsOptional()
  @IsString({ message: 'Descrição deve ser uma string' })
  @MaxLength(255, { message: 'Descrição deve ter no máximo 255 caracteres' })
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['products.list', 'stock.create'],
    description: 'Códigos de permissão que compõem o perfil',
  })
  @IsArray({ message: 'permissionCodes deve ser uma lista' })
  @IsString({ each: true, message: 'Cada código de permissão deve ser texto' })
  permissionCodes: string[];
}
