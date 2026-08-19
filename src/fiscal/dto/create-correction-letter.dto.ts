import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import {
  CORRECAO_TAMANHO_MAXIMO,
  CORRECAO_TAMANHO_MINIMO,
} from '../events/fiscal-events.rules';

export class CreateCorrectionLetterDto {
  @ApiProperty({
    description:
      'Texto da correção. A carta corrige erro em campo NÃO essencial — não ' +
      'pode alterar valores, datas nem as partes. A condição de uso legal ' +
      'acompanha a resposta e deve ser exibida antes da confirmação.',
    minLength: CORRECAO_TAMANHO_MINIMO,
    maxLength: CORRECAO_TAMANHO_MAXIMO,
    example: 'Corrigir o nome do bairro do destinatário para Centro',
  })
  @IsString()
  @Length(CORRECAO_TAMANHO_MINIMO, CORRECAO_TAMANHO_MAXIMO, {
    message:
      `Texto da correção deve ter entre ${CORRECAO_TAMANHO_MINIMO} e ` +
      `${CORRECAO_TAMANHO_MAXIMO} caracteres`,
  })
  correcao: string;
}
