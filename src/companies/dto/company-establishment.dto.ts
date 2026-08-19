import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsUf } from '../../common/validators/is-uf.validator';

/** Endereço fiscal do estabelecimento, validado no formato que a SEFAZ exige. */
export class CompanyEstablishmentAddressDto {
  @ApiPropertyOptional({ example: '01001000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido. Esperado: 8 dígitos' })
  cep?: string;

  @ApiPropertyOptional({ example: 'Rua das Flores' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: '100' })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({ example: 'Sala 2' })
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'SP', maxLength: 2 })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  @IsUf()
  state?: string;

  @ApiPropertyOptional({
    example: '3550308',
    description: 'Código IBGE do município (7 dígitos)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'Código IBGE do município deve ter 7 dígitos',
  })
  ibgeCode?: string;
}

export class CompanyEstablishmentDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'Filial SP' })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Nome do estabelecimento deve ter no mínimo 2 caracteres',
  })
  socialReason?: string;

  @ApiPropertyOptional({
    example: '123456789012',
    description: 'Inscrição Estadual (IE)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,14}$/, {
    message: 'Inscrição Estadual inválida. Esperado: 2 a 14 dígitos',
  })
  stateRegistration?: string;

  @ApiPropertyOptional({
    description: 'Endereço do estabelecimento',
    type: CompanyEstablishmentAddressDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyEstablishmentAddressDto)
  address?: CompanyEstablishmentAddressDto;
}
