import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Status que a central de rejeições exibe. */
export const STATUS_REJEICAO = ['REJEITADO', 'ERRO'] as const;

export class QueryFiscalRejectionsDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Filtrar por um dos status de falha. Sem filtro, traz REJEITADO e ERRO',
    enum: STATUS_REJEICAO,
  })
  @IsOptional()
  @IsEnum(STATUS_REJEICAO)
  status?: (typeof STATUS_REJEICAO)[number];

  @ApiPropertyOptional({ description: 'Filtrar por estabelecimento' })
  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por código de rejeição da SEFAZ (ex.: 539)',
  })
  @IsOptional()
  @IsString()
  rejeicaoCodigo?: string;

  @ApiPropertyOptional({ description: 'Data inicial (ISO 8601)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data final (ISO 8601)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
