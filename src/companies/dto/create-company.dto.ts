import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessSegment, CompanyType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Minha Empresa Ltda' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ enum: CompanyType })
  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @ApiPropertyOptional({ enum: BusinessSegment })
  @IsOptional()
  @IsEnum(BusinessSegment)
  businessSegment?: BusinessSegment;

  @ApiPropertyOptional({ example: '(11) 9999-9999' })
  @IsOptional()
  @IsString()
  phone?: string;
}
