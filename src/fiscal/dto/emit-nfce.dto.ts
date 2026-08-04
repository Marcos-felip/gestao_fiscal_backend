import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EmitNfceItemDto {
  @ApiProperty({ description: 'ID do produto' })
  @IsString()
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Quantidade', minimum: 0.0001 })
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Preço unitário', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  unitPrice: number;
}

export class EmitNfcePaymentDto {
  @ApiProperty({
    description: 'Código da forma de pagamento fiscal',
    enum: [
      'DINHEIRO',
      'CHEQUE',
      'CARTAO_CREDITO',
      'CARTAO_DEBITO',
      'CREDITO_LOJA',
      'VALE_ALIMENTACAO',
      'VALE_REFEICAO',
      'VALE_PRESENTE',
      'VALE_COMBUSTIVEL',
      'BOLETO',
      'PIX',
      'SEM_PAGAMENTO',
      'OUTRO',
    ],
  })
  @IsEnum([
    'DINHEIRO',
    'CHEQUE',
    'CARTAO_CREDITO',
    'CARTAO_DEBITO',
    'CREDITO_LOJA',
    'VALE_ALIMENTACAO',
    'VALE_REFEICAO',
    'VALE_PRESENTE',
    'VALE_COMBUSTIVEL',
    'BOLETO',
    'PIX',
    'SEM_PAGAMENTO',
    'OUTRO',
  ])
  code: string;

  @ApiProperty({ description: 'Valor pago nesta forma' })
  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class EmitNfceDto {
  @ApiProperty({ description: 'ID da venda vinculada' })
  @IsString()
  @IsUUID()
  saleId: string;

  @ApiPropertyOptional({
    description: 'ID do estabelecimento (se diferente da venda)',
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  establishmentId?: string;

  @ApiPropertyOptional({
    description: 'Chave de idempotência para evitar emissão duplicada',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: [EmitNfcePaymentDto],
    description: 'Formas de pagamento',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmitNfcePaymentDto)
  payments?: EmitNfcePaymentDto[];
}
