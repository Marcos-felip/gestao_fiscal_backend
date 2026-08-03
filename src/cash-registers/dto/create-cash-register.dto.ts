import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCashRegisterDto {
  @ApiProperty({ description: 'Estabelecimento onde o terminal fica' })
  @IsUUID()
  @IsNotEmpty()
  establishmentId: string;

  @ApiProperty({ example: 'Caixa 01' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
