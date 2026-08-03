import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseCashSessionDto {
  @ApiProperty({ description: 'Dinheiro contado na gaveta no fechamento' })
  @IsNumber()
  @Min(0)
  countedCash: number;

  @ApiPropertyOptional({
    description: 'Obrigatório quando há diferença entre o contado e o esperado',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
