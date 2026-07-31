import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterPayableDto extends PaginationDto {
  @ApiPropertyOptional({ enum: FinancialStatus })
  @IsOptional()
  @IsEnum(FinancialStatus)
  status?: FinancialStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  purchaseId?: string;

  @ApiPropertyOptional({
    description: 'Somente títulos vencidos (vencimento passado e em aberto)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Vencimento a partir de' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Vencimento até' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
