import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FilterDashboardDto {
  @ApiPropertyOptional({
    description:
      'Restringe os indicadores a um estabelecimento. Sem ele, os números somam toda a empresa ativa.',
  })
  @IsOptional()
  @IsUUID()
  establishmentId?: string;
}
