import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FilterDashboardDto } from './filter-dashboard.dto';

/** Períodos que a série de faturamento aceita. */
export enum SalesChartRange {
  /** Últimos 30 dias, um ponto por dia. */
  LAST_30_DAYS = '30d',
  /** Últimos 12 meses, um ponto por mês. */
  LAST_12_MONTHS = '12m',
}

export class SalesChartDto extends FilterDashboardDto {
  @ApiPropertyOptional({
    enum: SalesChartRange,
    default: SalesChartRange.LAST_30_DAYS,
    description: 'Janela da série: últimos 30 dias ou últimos 12 meses',
  })
  @IsOptional()
  @IsEnum(SalesChartRange, {
    message: 'Período inválido. Use "30d" para dias ou "12m" para meses.',
  })
  range?: SalesChartRange;
}
