import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentCondition, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateSaleItemDto } from './create-sale-item.dto';

export class CreateSaleDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  establishmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentCondition,
    default: PaymentCondition.A_VISTA,
  })
  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @ApiPropertyOptional({
    default: 1,
    description: 'Número de parcelas. Usado apenas quando A_PRAZO.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;

  @ApiPropertyOptional({
    description: 'Vencimento da 1ª parcela. Default: hoje + intervalDays.',
  })
  @IsOptional()
  @IsDateString()
  firstDueDate?: string;

  @ApiPropertyOptional({ default: 30, description: 'Dias entre parcelas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleDate?: string;

  @ApiPropertyOptional({
    description:
      'Finaliza a venda na mesma chamada (PDV). Dá baixa no estoque imediatamente.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
