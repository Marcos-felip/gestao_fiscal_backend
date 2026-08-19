import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryFiscalDocumentsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por status do documento fiscal',
    enum: [
      'NAO_EMITIDO',
      'PENDENTE',
      'PROCESSANDO',
      'AUTORIZADO',
      'REJEITADO',
      'ERRO',
      'CONTINGENCIA',
      'CANCELAMENTO_PENDENTE',
      'CANCELADO',
      'INUTILIZADO',
    ],
  })
  @IsOptional()
  @IsEnum([
    'NAO_EMITIDO',
    'PENDENTE',
    'PROCESSANDO',
    'AUTORIZADO',
    'REJEITADO',
    'ERRO',
    'CONTINGENCIA',
    'CANCELAMENTO_PENDENTE',
    'CANCELADO',
    'INUTILIZADO',
  ])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por modelo (NFE ou NFCE)',
    enum: ['NFE', 'NFCE'],
  })
  @IsOptional()
  @IsEnum(['NFE', 'NFCE'])
  modelo?: string;

  @ApiPropertyOptional({ description: 'Filtrar por venda' })
  @IsOptional()
  @IsUUID()
  saleId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estabelecimento' })
  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @ApiPropertyOptional({ description: 'Data inicial (ISO 8601)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data final (ISO 8601)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
