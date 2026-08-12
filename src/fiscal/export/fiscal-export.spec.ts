import { BadRequestException } from '@nestjs/common';
import {
  FiscalDocumentModel,
  FiscalDocumentStatus,
  FiscalEnvironment,
  Prisma,
} from '@prisma/client';
import {
  DocumentoExportavel,
  LinhaManifesto,
  montarLoteDeExportacao,
  montarManifesto,
  nomeArquivoXml,
  nomeArquivoZip,
  resolverPeriodo,
} from './fiscal-export';

const CHAVE = '31260851720322000146650010000000071009048390';
const OUTRA_CHAVE = '31260851720322000146650010000000081009048391';

const documento = (
  overrides: Partial<DocumentoExportavel> = {},
): DocumentoExportavel => ({
  chaveAcesso: CHAVE,
  numero: 7,
  serie: 1,
  modelo: FiscalDocumentModel.NFCE,
  status: FiscalDocumentStatus.AUTORIZADO,
  dataAutorizacao: new Date('2026-08-10T14:32:05Z'),
  valorTotal: new Prisma.Decimal('123.45'),
  xmlAutorizado: '<nfeProc>autorizado</nfeProc>',
  xmlCancelamento: null,
  ...overrides,
});

/** Destino de teste: guarda o que seria escrito no ZIP. */
const criarDestino = () => {
  const arquivos = new Map<string, string>();
  return {
    arquivos,
    adicionar: (nome: string, conteudo: string) => arquivos.set(nome, conteudo),
  };
};

/** Leitor que devolve o valor da coluna, como acontece sem storage. */
const lerDaColuna = (valor: string | null) => Promise.resolve(valor);

describe('resolverPeriodo', () => {
  it('estende a data de fim sem hora até o fim do dia', () => {
    const { inicio, fim } = resolverPeriodo('2026-08-01', '2026-08-31');

    expect(inicio.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    // Sem isso, pedir o mês inteiro deixaria as notas do dia 31 de fora.
    expect(fim.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it('preserva a hora quando ela é informada', () => {
    const { fim } = resolverPeriodo(
      '2026-08-01T00:00:00Z',
      '2026-08-02T10:00:00Z',
    );

    expect(fim.toISOString()).toBe('2026-08-02T10:00:00.000Z');
  });

  it('recusa data de fim anterior à de início', () => {
    expect(() => resolverPeriodo('2026-08-31', '2026-08-01')).toThrow(
      BadRequestException,
    );
  });

  it('recusa data inválida', () => {
    expect(() => resolverPeriodo('ontem', '2026-08-01')).toThrow(
      BadRequestException,
    );
  });

  it('aceita exatamente 92 dias', () => {
    expect(() =>
      resolverPeriodo('2026-01-01T00:00:00Z', '2026-04-03T00:00:00Z'),
    ).not.toThrow();
  });

  it('recusa período acima de 92 dias com mensagem em português', () => {
    expect(() => resolverPeriodo('2026-01-01', '2026-12-31')).toThrow(
      /92 dias/,
    );
  });
});

describe('nomeArquivoXml', () => {
  it('nomeia pela chave de acesso com o sufixo do tipo', () => {
    expect(nomeArquivoXml(CHAVE, 'nfe')).toBe(`${CHAVE}-nfe.xml`);
    expect(nomeArquivoXml(CHAVE, 'cancelamento')).toBe(
      `${CHAVE}-cancelamento.xml`,
    );
  });
});

describe('nomeArquivoZip', () => {
  const periodo = resolverPeriodo('2026-08-01', '2026-08-31');

  it('traz empresa e período', () => {
    expect(
      nomeArquivoZip(
        'Churrascaria Boi na Brasa',
        periodo,
        FiscalEnvironment.PRODUCAO,
      ),
    ).toBe('xmls-churrascaria-boi-na-brasa-2026-08-01-a-2026-08-31.zip');
  });

  it('marca homologação no nome do arquivo', () => {
    const nome = nomeArquivoZip(
      'Padaria Eliete',
      periodo,
      FiscalEnvironment.HOMOLOGACAO,
    );

    // O ZIP circula por e-mail longe desta tela: XML de teste escriturado como
    // real é problema fiscal, e o nome é o único aviso que viaja junto.
    expect(nome).toContain('HOMOLOGACAO-SEM-VALOR-FISCAL');
  });

  it('remove acentos e pontuação do nome da empresa', () => {
    const nome = nomeArquivoZip(
      'Alimentação & Cia. Ltda',
      periodo,
      FiscalEnvironment.PRODUCAO,
    );

    expect(nome).toBe('xmls-alimentacao-cia-ltda-2026-08-01-a-2026-08-31.zip');
  });
});

describe('montarManifesto', () => {
  const linha = (overrides: Partial<LinhaManifesto> = {}): LinhaManifesto => ({
    chaveAcesso: CHAVE,
    numero: 7,
    serie: 1,
    modelo: FiscalDocumentModel.NFCE,
    dataAutorizacao: new Date('2026-08-10T14:32:05Z'),
    status: FiscalDocumentStatus.AUTORIZADO,
    valorTotal: '123.45',
    ausentes: [],
    ...overrides,
  });

  it('abre com BOM para o Excel em português não trocar os acentos', () => {
    expect(montarManifesto([]).startsWith('\uFEFF')).toBe(true);
  });

  it('traz o cabeçalho mesmo sem nenhum documento', () => {
    const csv = montarManifesto([]);

    expect(csv).toContain('Chave de acesso;Número;Série;Modelo');
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });

  it('escreve uma linha por documento, com vírgula decimal', () => {
    const csv = montarManifesto([linha()]);
    const [, primeira] = csv.trim().split('\r\n');

    expect(primeira).toBe(
      `${CHAVE};7;1;NFCE;10/08/2026 14:32:05;AUTORIZADO;123,45;`,
    );
  });

  it('registra os arquivos ausentes na última coluna', () => {
    const csv = montarManifesto([
      linha({
        status: FiscalDocumentStatus.CANCELADO,
        ausentes: ['cancelamento'],
      }),
    ]);

    expect(csv.trim().split('\r\n')[1]).toMatch(/;cancelamento$/);
  });

  it('deixa a data em branco quando não há autorização', () => {
    const csv = montarManifesto([linha({ dataAutorizacao: null })]);

    expect(csv.trim().split('\r\n')[1]).toContain(';;AUTORIZADO;');
  });
});

describe('montarLoteDeExportacao', () => {
  it('exporta o XML autorizado e registra o documento no manifesto', async () => {
    const destino = criarDestino();

    const manifesto = await montarLoteDeExportacao(
      [documento()],
      lerDaColuna,
      destino,
    );

    expect([...destino.arquivos.keys()]).toEqual([`${CHAVE}-nfe.xml`]);
    expect(destino.arquivos.get(`${CHAVE}-nfe.xml`)).toBe(
      '<nfeProc>autorizado</nfeProc>',
    );
    expect(manifesto).toHaveLength(1);
    expect(manifesto[0].ausentes).toEqual([]);
    expect(manifesto[0].valorTotal).toBe('123.45');
  });

  it('leva os dois XMLs quando a nota está cancelada', async () => {
    const destino = criarDestino();

    const manifesto = await montarLoteDeExportacao(
      [
        documento({
          status: FiscalDocumentStatus.CANCELADO,
          xmlCancelamento: '<procEventoNFe>cancelamento</procEventoNFe>',
        }),
      ],
      lerDaColuna,
      destino,
    );

    expect([...destino.arquivos.keys()].sort()).toEqual([
      `${CHAVE}-cancelamento.xml`,
      `${CHAVE}-nfe.xml`,
    ]);
    expect(manifesto[0].ausentes).toEqual([]);
  });

  it('marca o cancelamento como ausente quando o XML do evento não foi guardado', async () => {
    const destino = criarDestino();

    const manifesto = await montarLoteDeExportacao(
      [
        documento({
          status: FiscalDocumentStatus.CANCELADO,
          xmlCancelamento: null,
        }),
      ],
      lerDaColuna,
      destino,
    );

    // O autorizado continua indo: melhor a nota com pendência anotada do que
    // sem nenhum arquivo.
    expect([...destino.arquivos.keys()]).toEqual([`${CHAVE}-nfe.xml`]);
    expect(manifesto[0].ausentes).toEqual(['cancelamento']);
  });

  it('não interrompe o lote quando um XML não volta do storage', async () => {
    const destino = criarDestino();
    const lerComFalha = jest
      .fn<Promise<string | null>, [string | null]>()
      .mockResolvedValueOnce(null) // primeiro documento: sumiu do storage
      .mockResolvedValueOnce('<nfeProc>segundo</nfeProc>');

    const manifesto = await montarLoteDeExportacao(
      [
        documento({ xmlAutorizado: 'fiscal/empresa/2026/08/perdido.xml' }),
        documento({ chaveAcesso: OUTRA_CHAVE, numero: 8 }),
      ],
      lerComFalha,
      destino,
    );

    // Um arquivo perdido em agosto não pode impedir o fechamento do mês.
    expect([...destino.arquivos.keys()]).toEqual([`${OUTRA_CHAVE}-nfe.xml`]);
    expect(manifesto).toHaveLength(2);
    expect(manifesto[0].ausentes).toEqual(['nfe']);
    expect(manifesto[1].ausentes).toEqual([]);
  });

  it('marca como ausente o documento sem chave de acesso', async () => {
    const destino = criarDestino();

    const manifesto = await montarLoteDeExportacao(
      [documento({ chaveAcesso: null })],
      lerDaColuna,
      destino,
    );

    expect(destino.arquivos.size).toBe(0);
    expect(manifesto[0].ausentes).toEqual(['nfe']);
  });

  it('devolve manifesto vazio quando não há documentos', async () => {
    const destino = criarDestino();

    await expect(
      montarLoteDeExportacao([], lerDaColuna, destino),
    ).resolves.toEqual([]);
    expect(destino.arquivos.size).toBe(0);
  });
});
