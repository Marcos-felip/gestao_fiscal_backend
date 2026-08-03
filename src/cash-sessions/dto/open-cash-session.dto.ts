import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenCashSessionDto {
  @ApiProperty({ description: 'Terminal onde o turno será aberto' })
  @IsUUID()
  cashRegisterId: string;

  @ApiProperty({ description: 'Fundo de troco em gaveta na abertura' })
  @IsNumber()
  @Min(0)
  openingAmount: number;
}
