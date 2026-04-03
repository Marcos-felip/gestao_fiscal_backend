import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TaxRegime } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inscricaoMunicipal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ maxLength: 2 })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;
}
