import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsPositive } from 'class-validator';

export class SalePaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ description: 'Valor pago nesta forma' })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description:
      'Valor entregue pelo cliente; só se aplica a DINHEIRO e serve para calcular o troco',
  })
  @IsOptional()
  @IsPositive()
  amountReceived?: number;
}
