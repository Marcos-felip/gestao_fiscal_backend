import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';

export class CompanyEstablishmentDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'Filial SP' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome do estabelecimento deve ter no mínimo 2 caracteres' })
  socialReason?: string;

  @ApiPropertyOptional({
    example: '123456789012',
    description: 'Inscrição Estadual (IE)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11,}$/, {
    message: 'Inscrição Estadual inválida. Esperado: 11 ou mais dígitos',
  })
  stateRegistration?: string;

  @ApiPropertyOptional({
    description: 'Endereço do estabelecimento',
  })
  @IsOptional()
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
}
