import { FiscalEnvironment } from '@prisma/client';
import { buildEmitirNfceRequest } from './emit-request.builder';
import { FiscalSnapshot } from './fiscal-snapshot.builder';

/** CSC no formato que MG emite: 32 caracteres hexadecimais. Valor fictício. */
const CSC_VALIDO = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

const snapshot = (overrides: Partial<FiscalSnapshot> = {}): FiscalSnapshot => ({
  versao: 2,
  venda: {
    id: 'sale-1',
    numero: 1001,
    subtotal: 10,
    desconto: 0,
    total: 10,
    data: '2026-08-04T12:00:00.000Z',
  },
  emitente: {
    cnpj: '11222333000181',
    razaoSocial: 'Empresa Teste LTDA',
    inscricaoEstadual: '123456789',
    crt: '1',
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    codigoMunicipio: '3550308',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01001000',
  },
  itens: [
    {
      numeroItem: 1,
      codigoProduto: 'REF350',
      descricao: 'Refrigerante Lata 350ml',
      ncm: '22021000',
      cfop: '5102',
      unidadeComercial: 'UN',
      quantidade: 2,
      valorUnitario: 5,
      imposto: {
        icms: { situacao: '102', origem: 0 },
        pis: { situacao: '07' },
        cofins: { situacao: '07' },
      },
    },
  ],
  pagamentos: [{ tipo: 'dinheiro', valor: 10 }],
  valorTotal: 10,
  ...overrides,
});

const contexto = {
  serie: 1,
  numero: 42,
  ambiente: FiscalEnvironment.HOMOLOGACAO,
  codigoCsc: CSC_VALIDO,
  idCsc: '000001',
};

describe('buildEmitirNfceRequest', () => {
  it('converte o snapshot no payload do motor', () => {
    const request = buildEmitirNfceRequest(snapshot(), contexto);

    expect(request).toMatchObject({
      serie: 1,
      numero: 42,
      ambiente: 'homologacao',
      codigoCsc: CSC_VALIDO,
      idCsc: '000001',
      valorTotal: 10,
    });
    expect(request.itens).toHaveLength(1);
    expect(request.emitente.crt).toBe('1');
  });

  it('traduz o ambiente de produção', () => {
    const request = buildEmitirNfceRequest(snapshot(), {
      ...contexto,
      ambiente: FiscalEnvironment.PRODUCAO,
    });

    expect(request.ambiente).toBe('producao');
  });

  it('exige CSC e ID do CSC configurados', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, codigoCsc: null }),
    ).toThrow(/CSC/);
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, idCsc: '  ' }),
    ).toThrow(/CSC/);
  });

  // O CSC de 6 dígitos é o caso real que gerou a rejeição 464 em 10/08/2026:
  // passou por todas as validações, consumiu numeração e só falhou na SEFAZ.
  it('recusa CSC curto antes de consumir numeração', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, codigoCsc: '123456' }),
    ).toThrow(/fora do formato esperado/);
  });

  it('recusa CSC com pontuação', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot(), {
        ...contexto,
        codigoCsc: 'ABCD-EFGH-IJKL-MNOP-QRST',
      }),
    ).toThrow(/fora do formato esperado/);
  });

  it('recusa ID do CSC não numérico ou longo demais', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, idCsc: 'ABC' }),
    ).toThrow(/ID do CSC/);
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, idCsc: '1234567' }),
    ).toThrow(/ID do CSC/);
  });

  it('aceita o CSC no tamanho que MG emite (32 hexadecimais)', () => {
    const request = buildEmitirNfceRequest(snapshot(), contexto);

    expect(request.codigoCsc).toBe(CSC_VALIDO);
  });

  it('recusa série e número fora da faixa aceita', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, serie: 0 }),
    ).toThrow(/Série/);
    expect(() =>
      buildEmitirNfceRequest(snapshot(), { ...contexto, numero: 0 }),
    ).toThrow(/Número/);
  });

  it('recusa divergência entre itens e valor total', () => {
    expect(() =>
      buildEmitirNfceRequest(snapshot({ valorTotal: 25 }), contexto),
    ).toThrow(/Total dos itens/);
  });

  it('recusa divergência entre pagamentos e valor total', () => {
    expect(() =>
      buildEmitirNfceRequest(
        snapshot({ pagamentos: [{ tipo: 'pix', valor: 7 }] }),
        contexto,
      ),
    ).toThrow(/Total dos pagamentos/);
  });

  it('aceita diferença dentro da tolerância de um centavo', () => {
    const request = buildEmitirNfceRequest(
      snapshot({ pagamentos: [{ tipo: 'pix', valor: 10.01 }] }),
      contexto,
    );

    expect(request.pagamentos[0].valor).toBe(10.01);
  });

  it('recusa documento sem snapshot', () => {
    expect(() => buildEmitirNfceRequest(null, contexto)).toThrow(
      /sem snapshot/,
    );
  });

  it('recusa snapshot de versão desconhecida', () => {
    expect(() =>
      buildEmitirNfceRequest(
        { versao: 99, itens: [] } as unknown as FiscalSnapshot,
        contexto,
      ),
    ).toThrow(/não suportado/);
  });
});
