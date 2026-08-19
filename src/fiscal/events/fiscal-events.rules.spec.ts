import {
  agruparEmFaixas,
  buracosDaNumeracao,
  conflitosNaFaixa,
  mensagemDeConflito,
  protocoloDeDuplicidade,
} from './fiscal-events.rules';

/**
 * As regras que o motor não tem como impor, porque ele é stateless.
 *
 * A que mais importa: **inutilizar número de nota autorizada é o erro caro**. A
 * SEFAZ recusaria, mas depois — e sem dizer qual número. Conferir aqui permite
 * nomeá-lo.
 */

const usado = (numero: number, chaveAcesso: string | null = null) => ({
  numero,
  chaveAcesso,
  status: 'AUTORIZADO',
});

describe('conflitosNaFaixa', () => {
  it('acha o número usado dentro da faixa pedida', () => {
    const conflitos = conflitosNaFaixa(1, 10, [usado(4), usado(20)]);

    expect(conflitos.map((c) => c.numero)).toEqual([4]);
  });

  it('inclui os extremos da faixa', () => {
    const conflitos = conflitosNaFaixa(5, 7, [usado(5), usado(7)]);

    expect(conflitos).toHaveLength(2);
  });

  it('devolve vazio quando a faixa é só de buracos', () => {
    expect(conflitosNaFaixa(2, 3, [usado(1), usado(4)])).toEqual([]);
  });
});

describe('mensagemDeConflito', () => {
  it('nomeia o número e a chave, que é o que permite corrigir a faixa', () => {
    const mensagem = mensagemDeConflito([
      usado(4, '31260851720322000146650010000000041679548502'),
    ]);

    expect(mensagem).toContain('o número 4');
    expect(mensagem).toContain('31260851720322000146650010000000041679548502');
  });

  it('resume quando há muitos, em vez de despejar a lista', () => {
    const mensagem = mensagemDeConflito(
      [1, 2, 3, 4, 5, 6, 7].map((n) => usado(n)),
    );

    expect(mensagem).toContain('e mais 2');
  });

  it('concorda o plural com a quantidade, inclusive no verbo', () => {
    // A primeira versão dizia "o número 3 … que já pertencem", e apareceu assim
    // na primeira recusa real.
    expect(mensagemDeConflito([usado(4)])).toContain(
      'o número 4, que já pertence a um documento emitido',
    );
    expect(mensagemDeConflito([usado(4), usado(5)])).toContain(
      'os números 4, 5, que já pertencem a documentos emitidos',
    );
  });
});

describe('protocoloDeDuplicidade', () => {
  it('extrai o protocolo da recusa por faixa já inutilizada', () => {
    // Mensagem real da SEFAZ MG, 14/08/2026 — o pedido anterior tinha sido
    // homologado, mas a resposta não voltou a tempo.
    expect(
      protocoloDeDuplicidade(
        'Rejeicao: Ja existe pedido de Inutilizacao com a mesma faixa de inutilizacao (nProt: 131260152624931)',
      ),
    ).toBe('131260152624931');
  });

  it('ignora recusa de outro motivo', () => {
    expect(protocoloDeDuplicidade('Rejeicao: Falha no esquema XML')).toBeNull();
  });

  it('devolve nulo quando a duplicidade vem sem protocolo', () => {
    expect(
      protocoloDeDuplicidade('Ja existe pedido de Inutilizacao para a faixa'),
    ).toBeNull();
  });

  it('devolve nulo sem motivo nenhum', () => {
    expect(protocoloDeDuplicidade(undefined)).toBeNull();
  });
});

describe('buracosDaNumeracao', () => {
  it('acha o número reservado que nunca virou documento', () => {
    // É o caso real: a NF-e nº 1 foi reservada, a criação falhou, e o número
    // se perdeu — a emissão seguinte saiu com o 2.
    expect(buracosDaNumeracao(3, [2])).toEqual([1]);
  });

  it('não considera buraco o próximo número, que ainda será usado', () => {
    expect(buracosDaNumeracao(4, [1, 2, 3])).toEqual([]);
  });

  it('acha vários buracos', () => {
    expect(buracosDaNumeracao(8, [1, 3, 6])).toEqual([2, 4, 5, 7]);
  });

  it('devolve vazio quando nada foi emitido ainda', () => {
    expect(buracosDaNumeracao(1, [])).toEqual([]);
  });
});

describe('agruparEmFaixas', () => {
  it('junta números contíguos numa faixa só', () => {
    expect(agruparEmFaixas([4, 5, 6])).toEqual([{ inicio: 4, fim: 6 }]);
  });

  it('separa os que não se encostam', () => {
    expect(agruparEmFaixas([1, 3, 4, 9])).toEqual([
      { inicio: 1, fim: 1 },
      { inicio: 3, fim: 4 },
      { inicio: 9, fim: 9 },
    ]);
  });

  it('ordena antes de agrupar', () => {
    expect(agruparEmFaixas([6, 4, 5])).toEqual([{ inicio: 4, fim: 6 }]);
  });

  it('devolve vazio para lista vazia', () => {
    expect(agruparEmFaixas([])).toEqual([]);
  });
});
