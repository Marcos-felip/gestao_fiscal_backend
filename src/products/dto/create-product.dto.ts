import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitOfMeasure } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ enum: UnitOfMeasure, default: UnitOfMeasure.UN })
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unit?: UnitOfMeasure = UnitOfMeasure.UN;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  costPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  salePrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cest?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cfop?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 8,
    description: 'Origem da mercadoria (0 a 8)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(8, { message: 'Origem da mercadoria deve estar entre 0 e 8' })
  origin?: number;

  @ApiPropertyOptional({
    example: '102',
    description:
      'CSOSN do Simples Nacional. Suportados pelo motor: 102, 103, 300, 400, 500',
  })
  @IsOptional()
  @IsString()
  csosn?: string;

  @ApiPropertyOptional({
    example: '40',
    description:
      'CST de ICMS do regime normal. Suportados pelo motor: 40, 41, 50',
  })
  @IsOptional()
  @IsString()
  cstIcms?: string;

  @ApiPropertyOptional({ example: '07', description: 'CST do PIS' })
  @IsOptional()
  @IsString()
  cstPis?: string;

  @ApiPropertyOptional({ example: '07', description: 'CST do COFINS' })
  @IsOptional()
  @IsString()
  cstCofins?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Alíquota de ICMS (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  aliquotaIcms?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Alíquota de PIS (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  aliquotaPis?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Alíquota de COFINS (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  aliquotaCofins?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      material: 'alumínio',
      larguraMm: 1200,
      alturaMm: 2100,
      acabamento: { cor: 'branco' },
    },
  })
  @IsOptional()
  @IsObject()
  technicalAttributes?: Record<string, unknown>;
}
