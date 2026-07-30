import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPositive, IsUUID } from 'class-validator';

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
}
