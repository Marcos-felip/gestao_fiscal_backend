import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType, TaxRegime } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';
import { CompanyEstablishmentDto } from './company-establishment.dto';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Minha Empresa Ltda' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  name?: string;

  @ApiPropertyOptional({ enum: CompanyType })
  @IsOptional()
  @IsEnum(CompanyType, {
    message:
      'Tipo de empresa inválido. Valores válidos: MEI, ME, EPP, LTDA, SA, EIRELI, SLU',
  })
  type?: CompanyType;

  @ApiPropertyOptional({ example: '12.345.678/0001-95' })
  @IsOptional()
  @IsString()
  @IsCnpj({ message: 'CNPJ inválido. Formato esperado: XX.XXX.XXX/XXXX-XX' })
  cnpj?: string;

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

  @ApiPropertyOptional({ example: '(11) 9999-9999' })
  @IsOptional()
  @IsString()
  @Matches(/^(\(?\d{1,3}\)?)? ?\d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Formato esperado: (XX) XXXXX-XXXX',
  })
  phone?: string;

  @ApiPropertyOptional({ enum: TaxRegime })
  @IsOptional()
  @IsEnum(TaxRegime, {
    message:
      'Regime tributário inválido. Valores válidos: SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, MEI',
  })
  taxRegime?: TaxRegime;

  @ApiPropertyOptional({
    description: 'Dados do estabelecimento MATRIZ para atualizar (opcional)',
    type: CompanyEstablishmentDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyEstablishmentDto)
  establishment?: CompanyEstablishmentDto;
}
