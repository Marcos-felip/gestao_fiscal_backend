import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { SalePaymentDto } from './sale-payment.dto';

export class ConfirmSaleDto {
  @ApiPropertyOptional({
    type: [SalePaymentDto],
    description:
      'Obrigatório em venda A_VISTA; a soma deve fechar o total. Ignorado em A_PRAZO.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];
}
