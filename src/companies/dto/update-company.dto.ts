import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType, TaxRegime, TaxRegimeCode } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
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
    example: false,
    description:
      'Fechamento de caixa às cegas: o operador não vê o valor esperado antes de contar',
  })
  @IsOptional()
  @IsBoolean()
  cashBlindClose?: boolean;

  @ApiPropertyOptional({
    example: 'Minha Empresa Comércio de Bebidas LTDA',
    description: 'Razão social usada como emitente na NFC-e',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Razão social deve ter no mínimo 2 caracteres' })
  razaoSocial?: string;

  @ApiPropertyOptional({ example: 'Minha Empresa' })
  @IsOptional()
  @IsString()
  nomeFantasia?: string;

  @ApiPropertyOptional({
    example: '123456789012',
    description: 'Inscrição Estadual da empresa (emitente)',
  })
  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @IsString()
  inscricaoMunicipal?: string;

  @ApiPropertyOptional({
    enum: TaxRegimeCode,
    description: 'Código de Regime Tributário (CRT) usado na emissão fiscal',
  })
  @IsOptional()
  @IsEnum(TaxRegimeCode, {
    message:
      'CRT inválido. Valores válidos: SIMPLES_NACIONAL, SIMPLES_EXCESSO, REGIME_NORMAL',
  })
  crt?: TaxRegimeCode;

  @ApiPropertyOptional({
    example: true,
    description: 'Empresa é contribuinte do ICMS',
  })
  @IsOptional()
  @IsBoolean()
  contribuinteIcms?: boolean;

  @ApiPropertyOptional({
    example: '3550308',
    description: 'Código IBGE do município (7 dígitos)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'Código IBGE do município deve ter 7 dígitos',
  })
  codigoIbgeMunicipio?: string;

  @ApiPropertyOptional({ example: '(11) 3333-4444' })
  @IsOptional()
  @IsString()
  telefoneFiscal?: string;

  @ApiPropertyOptional({ example: 'fiscal@minhaempresa.com.br' })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail fiscal inválido' })
  emailFiscal?: string;

  @ApiPropertyOptional({
    description: 'Dados do estabelecimento MATRIZ para atualizar (opcional)',
    type: CompanyEstablishmentDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyEstablishmentDto)
  establishment?: CompanyEstablishmentDto;
}
