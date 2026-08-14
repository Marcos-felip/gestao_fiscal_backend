import { ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentModel } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  Length,
  Matches,
  Min,
  Max,
} from 'class-validator';
import {
  CSC_TAMANHO_MAXIMO,
  CSC_TAMANHO_MINIMO,
} from '../emission/fiscal-rules';

export class UpdateFiscalSettingsDto {
  @ApiPropertyOptional({
    description: 'Ambiente fiscal',
    enum: ['HOMOLOGACAO', 'PRODUCAO'],
  })
  @IsOptional()
  @IsEnum(['HOMOLOGACAO', 'PRODUCAO'])
  ambiente?: string;

  @ApiPropertyOptional({
    description:
      'Modelos que o estabelecimento emite. Define o que o checklist de ' +
      'produção cobra: CSC e consulta pública só valem para quem emite NFC-e.',
    enum: FiscalDocumentModel,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({
    message:
      'Informe ao menos um modelo — um estabelecimento sem modelo não emite nada',
  })
  @IsEnum(FiscalDocumentModel, { each: true })
  modelosEmitidos?: FiscalDocumentModel[];

  @ApiPropertyOptional({
    description: 'Série da NFC-e',
    minimum: 1,
    maximum: 999,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  serieNfce?: number;

  @ApiPropertyOptional({ description: 'Próximo número da NFC-e', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  proximoNumeroNfce?: number;

  @ApiPropertyOptional({
    description:
      'Série da NF-e modelo 55. Independente da série da NFC-e: são duas ' +
      'sequências fiscais distintas, e misturá-las gera salto de numeração.',
    minimum: 1,
    maximum: 999,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  serieNfe?: number;

  @ApiPropertyOptional({
    description:
      'Próximo número da NF-e. Serve para continuar a numeração de outro ' +
      'sistema — começando do zero, o padrão 1 já emite.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  proximoNumeroNfe?: number;

  @ApiPropertyOptional({
    description:
      'Código CSC: 16 a 64 caracteres alfanuméricos, obtido no portal da SEFAZ ' +
      'da UF. É específico do ambiente — o de homologação não vale em produção.',
    minLength: CSC_TAMANHO_MINIMO,
    maxLength: CSC_TAMANHO_MAXIMO,
  })
  @IsOptional()
  @IsString()
  @Length(CSC_TAMANHO_MINIMO, CSC_TAMANHO_MAXIMO, {
    message: `O código CSC deve ter de ${CSC_TAMANHO_MINIMO} a ${CSC_TAMANHO_MAXIMO} caracteres. Copie o código gerado no portal da SEFAZ da sua UF, na área de credenciamento de NFC-e — não confunda com o ID do CSC.`,
  })
  @Matches(/^[A-Za-z0-9]+$/, {
    message:
      'O código CSC aceita apenas letras e números, sem espaços ou pontuação.',
  })
  codigoCsc?: string;

  @ApiPropertyOptional({
    description:
      'ID do CSC: token numérico de até 6 dígitos, emitido pela SEFAZ junto ' +
      'com o código CSC.',
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,6}$/, {
    message:
      'O ID do CSC deve ser numérico, com no máximo 6 dígitos. É o token que a SEFAZ emite junto com o código CSC — não é o código em si.',
  })
  idCsc?: string;

  @ApiPropertyOptional({
    description: 'Referência criptografada do certificado A1',
  })
  @IsOptional()
  @IsString()
  certificadoRef?: string;

  @ApiPropertyOptional({
    description: 'Referência criptografada da senha do certificado',
  })
  @IsOptional()
  @IsString()
  certificadoSenhaRef?: string;

  @ApiPropertyOptional({ description: 'Validade do certificado (ISO 8601)' })
  @IsOptional()
  @IsString()
  certificadoValidade?: string;

  @ApiPropertyOptional({ description: 'Subject DN do certificado' })
  @IsOptional()
  @IsString()
  certificadoSubject?: string;

  @ApiPropertyOptional({ description: 'Configuração fiscal ativa' })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
