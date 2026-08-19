import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TaxRegime } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';
import { IsUf } from '../../common/validators/is-uf.validator';

export class OnboardingDto {
  @ApiProperty({ description: 'CNPJ da empresa' })
  @IsString()
  @IsCnpj()
  cnpj: string;

  @ApiProperty({ enum: TaxRegime, description: 'Regime tributário' })
  @IsEnum(TaxRegime)
  taxRegime: TaxRegime;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Nome do estabelecimento MATRIZ', minLength: 2 })
  @IsString()
  @MinLength(2)
  establishmentName: string;

  @ApiPropertyOptional({ example: '123456789012' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,14}$/, {
    message: 'Inscrição Estadual inválida. Esperado: 2 a 14 dígitos',
  })
  inscricaoEstadual?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inscricaoMunicipal?: string;

  @ApiPropertyOptional({ example: '01001000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido. Esperado: 8 dígitos' })
  cep?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional()
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
    description: 'Código IBGE do município do estabelecimento (7 dígitos)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'Código IBGE do município deve ter 7 dígitos',
  })
  ibgeCode?: string;
}
