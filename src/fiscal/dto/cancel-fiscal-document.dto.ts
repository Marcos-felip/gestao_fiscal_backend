import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CancelFiscalDocumentDto {
  @ApiProperty({
    description: 'Justificativa do cancelamento (15 a 255 caracteres)',
    example: 'Cancelamento por erro de digitação nos itens do pedido',
    minLength: 15,
    maxLength: 255,
  })
  @IsString({ message: 'A justificativa deve ser um texto' })
  @Length(15, 255, {
    message: 'A justificativa deve ter entre 15 e 255 caracteres',
  })
  justificativa!: string;
}
