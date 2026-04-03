import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterPartnerDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PartnerType })
  @IsOptional()
  @IsEnum(PartnerType)
  type?: PartnerType;
}
