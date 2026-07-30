import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateSaleItemDto } from './create-sale-item.dto';

export class UpdateSaleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    type: [CreateSaleItemDto],
    description: 'Quando informado, substitui a lista de itens por completo',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items?: CreateSaleItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleDate?: string;

  @ApiPropertyOptional({
    enum: [SaleStatus.ORCAMENTO, SaleStatus.EM_ABERTO],
    description:
      'Promove o orçamento a venda em aberto (ou volta). Finalizar e cancelar têm rotas próprias.',
  })
  @IsOptional()
  @IsIn([SaleStatus.ORCAMENTO, SaleStatus.EM_ABERTO])
  status?: SaleStatus;
}
