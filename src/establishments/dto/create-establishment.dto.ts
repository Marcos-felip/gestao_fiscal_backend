import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EstablishmentType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';

export class CreateEstablishmentDto {
  @ApiProperty({ description: 'Nome do estabelecimento', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ enum: EstablishmentType })
  @IsEnum(EstablishmentType)
  type: EstablishmentType;

  @ApiPropertyOptional({ description: 'CNPJ do estabelecimento' })
  @IsOptional()
  @IsString()
  @IsCnpj()
  cnpj?: string;

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
