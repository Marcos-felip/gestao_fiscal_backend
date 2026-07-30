import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateReceivableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Valor total, dividido entre as parcelas' })
  @IsPositive()
  totalAmount: number;

  @ApiProperty({ description: 'Vencimento da 1ª parcela' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;

  @ApiPropertyOptional({ default: 30, description: 'Dias entre parcelas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiPropertyOptional({ description: 'Agrupador para relatórios' })
  @IsOptional()
  @IsString()
  category?: string;
}
