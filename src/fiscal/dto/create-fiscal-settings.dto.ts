import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export class CreateFiscalSettingsDto {
  @ApiPropertyOptional({ description: 'Estabelecimento vinculado' })
  @IsOptional()
  @IsString()
  establishmentId?: string;

  @ApiPropertyOptional({
    description: 'Ambiente fiscal',
    enum: ['HOMOLOGACAO', 'PRODUCAO'],
    default: 'HOMOLOGACAO',
  })
  @IsOptional()
  @IsEnum(['HOMOLOGACAO', 'PRODUCAO'])
  ambiente?: string;

  @ApiPropertyOptional({
    description: 'Série da NFC-e',
    default: 1,
    minimum: 1,
    maximum: 999,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  serieNfce?: number;

  @ApiPropertyOptional({
    description: 'Código CSC (Código de Segurança do Contribuinte)',
  })
  @IsOptional()
  @IsString()
  codigoCsc?: string;

  @ApiPropertyOptional({ description: 'ID CSC' })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({
    description: 'Configuração fiscal ativa',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
