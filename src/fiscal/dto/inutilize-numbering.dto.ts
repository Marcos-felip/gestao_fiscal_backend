import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentModel } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import {
  JUSTIFICATIVA_TAMANHO_MAXIMO,
  JUSTIFICATIVA_TAMANHO_MINIMO,
} from '../events/fiscal-events.rules';

export class InutilizeNumberingDto {
  @ApiProperty({ description: 'Estabelecimento dono da numeração' })
  @IsUUID()
  establishmentId: string;

  @ApiProperty({ enum: FiscalDocumentModel })
  @IsEnum(FiscalDocumentModel)
  modelo: FiscalDocumentModel;

  @ApiProperty({ description: 'Série da numeração', minimum: 0 })
  @IsInt()
  @Min(0)
  serie: number;

  @ApiProperty({ description: 'Primeiro número da faixa', minimum: 1 })
  @IsInt()
  @Min(1)
  numeroInicial: number;

  @ApiProperty({
    description:
      'Último número da faixa. Igual ao inicial para inutilizar um número só, ' +
      'que é o caso comum.',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  numeroFinal: number;

  @ApiProperty({
    description: 'Motivo da inutilização',
    minLength: JUSTIFICATIVA_TAMANHO_MINIMO,
    maxLength: JUSTIFICATIVA_TAMANHO_MAXIMO,
    example: 'Numeração reservada e não utilizada por falha na emissão',
  })
  @IsString()
  @Length(JUSTIFICATIVA_TAMANHO_MINIMO, JUSTIFICATIVA_TAMANHO_MAXIMO, {
    message:
      `Justificativa deve ter entre ${JUSTIFICATIVA_TAMANHO_MINIMO} e ` +
      `${JUSTIFICATIVA_TAMANHO_MAXIMO} caracteres`,
  })
  justificativa: string;

  @ApiPropertyOptional({
    description:
      'Ano da numeração. Padrão: o ano corrente. Só informe para regularizar ' +
      'faixa de exercício anterior.',
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  ano?: number;
}
