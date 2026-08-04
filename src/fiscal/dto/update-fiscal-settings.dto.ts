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

export class UpdateFiscalSettingsDto {
  @ApiPropertyOptional({
    description: 'Ambiente fiscal',
    enum: ['HOMOLOGACAO', 'PRODUCAO'],
  })
  @IsOptional()
  @IsEnum(['HOMOLOGACAO', 'PRODUCAO'])
  ambiente?: string;

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

  @ApiPropertyOptional({ description: 'Código CSC' })
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
