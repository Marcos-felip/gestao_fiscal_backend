import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashSessionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterCashSessionDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CashSessionStatus })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;

  @ApiPropertyOptional({ description: 'Abertura a partir de' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Abertura até' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
