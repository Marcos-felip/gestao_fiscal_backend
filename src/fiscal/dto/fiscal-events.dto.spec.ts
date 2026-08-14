import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCorrectionLetterDto } from './create-correction-letter.dto';
import { InutilizeNumberingDto } from './inutilize-numbering.dto';

/**
 * Os tamanhos de texto são exigência da SEFAZ, não preferência nossa: fora da
 * faixa a rejeição vem depois, com mensagem técnica. Recusar aqui devolve o
 * limite em PT-BR antes de qualquer chamada.
 */

const mensagens = (dto: object) =>
  validateSync(dto).flatMap((erro) => Object.values(erro.constraints ?? {}));

const correcao = (texto: string) =>
  plainToInstance(CreateCorrectionLetterDto, { correcao: texto });

const inutilizacao = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(InutilizeNumberingDto, {
    establishmentId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    modelo: 'NFE',
    serie: 1,
    numeroInicial: 1,
    numeroFinal: 1,
    justificativa: 'Numeracao reservada e nao utilizada por falha na emissao',
    ...overrides,
  });

describe('CreateCorrectionLetterDto', () => {
  it('aceita texto dentro da faixa legal', () => {
    expect(mensagens(correcao('Corrigir o bairro do destinatario'))).toEqual(
      [],
    );
  });

  it('recusa texto curto demais citando os limites', () => {
    expect(mensagens(correcao('Bairro'))).toEqual([
      expect.stringContaining('entre 15 e 1000'),
    ]);
  });

  it('recusa texto acima de 1000 caracteres', () => {
    expect(mensagens(correcao('a'.repeat(1001)))).toHaveLength(1);
  });
});

describe('InutilizeNumberingDto', () => {
  it('aceita a faixa de um número só, que é o caso comum', () => {
    expect(mensagens(inutilizacao())).toEqual([]);
  });

  it('recusa justificativa curta demais', () => {
    expect(mensagens(inutilizacao({ justificativa: 'Erro' }))).toEqual([
      expect.stringContaining('entre 15 e 255'),
    ]);
  });

  it('recusa número zero — a numeração fiscal começa em 1', () => {
    expect(mensagens(inutilizacao({ numeroInicial: 0 }))).toHaveLength(1);
  });

  it('recusa modelo fora do enum', () => {
    expect(mensagens(inutilizacao({ modelo: 'NF3E' }))).toHaveLength(1);
  });

  it('dispensa o ano, que assume o exercício corrente', () => {
    expect(mensagens(inutilizacao({ ano: undefined }))).toEqual([]);
  });
});
