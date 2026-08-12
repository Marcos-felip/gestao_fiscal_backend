import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { FiscalDocumentModel, FiscalEnvironment } from '@prisma/client';

/**
 * Filtros da exportação em lote dos XMLs de um período.
 *
 * A coerência entre as datas (ordem e janela máxima) é validada no service,
 * junto do teto de documentos — os dois limites são a mesma regra de volume e
 * ficam num lugar só.
 */
export class ExportXmlsDto {
  @ApiProperty({
    description: 'Início do período (ISO 8601)',
    example: '2026-08-01',
  })
  @IsDateString(
    {},
    { message: 'A data de início deve estar no formato ISO 8601' },
  )
  dataInicio!: string;

  @ApiProperty({
    description: 'Fim do período (ISO 8601)',
    example: '2026-08-31',
  })
  @IsDateString({}, { message: 'A data de fim deve estar no formato ISO 8601' })
  dataFim!: string;

  @ApiPropertyOptional({ description: 'Filtrar por estabelecimento' })
  @IsOptional()
  @IsUUID('4', { message: 'O estabelecimento deve ser um UUID válido' })
  establishmentId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por modelo do documento',
    enum: FiscalDocumentModel,
  })
  @IsOptional()
  @IsEnum(FiscalDocumentModel, { message: 'O modelo deve ser NFE ou NFCE' })
  modelo?: FiscalDocumentModel;

  @ApiPropertyOptional({
    description:
      'Ambiente dos documentos. Sem valor, exporta apenas produção — ' +
      'homologação precisa ser pedida explicitamente.',
    enum: FiscalEnvironment,
    default: FiscalEnvironment.PRODUCAO,
  })
  @IsOptional()
  @IsEnum(FiscalEnvironment, {
    message: 'O ambiente deve ser PRODUCAO ou HOMOLOGACAO',
  })
  ambiente?: FiscalEnvironment;
}
