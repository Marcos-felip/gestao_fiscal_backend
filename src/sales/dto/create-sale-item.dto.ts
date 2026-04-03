import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Min } from 'class-validator';

export class CreateSaleItemDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty()
  @IsPositive()
  quantity: number;

  @ApiProperty()
  @IsPositive()
  unitPrice: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}
