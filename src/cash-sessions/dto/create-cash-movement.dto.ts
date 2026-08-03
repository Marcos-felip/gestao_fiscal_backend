import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType } from '@prisma/client';
import { IsEnum, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateCashMovementDto {
  @ApiProperty({
    enum: CashMovementType,
    description: 'SANGRIA tira dinheiro da gaveta; SUPRIMENTO coloca',
  })
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @ApiProperty()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Motivo, ex: "Depósito bancário"' })
  @IsOptional()
  @IsString()
  reason?: string;
}
