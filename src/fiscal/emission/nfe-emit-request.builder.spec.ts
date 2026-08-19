import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment, Prisma } from '@prisma/client';
import { buildEmitirNfeRequest } from './emit-request.builder';
import { FiscalSnapshot } from './fiscal-snapshot.builder';

/**
 * O builder é a última parada antes de queimar numeração na SEFAZ. O que ele
 * recusa aqui custa um 400; o que ele deixa passar errado custa um número de
 * nota e uma rejeição.
 */

const snapshotNfe = (overrides: Partial<FiscalSnapshot> = {}): FiscalSnapshot =>
  ({
    versao: 2,
    modelo: 'NFE',
    venda: {
      id: 'sale-1',
      numero: 1,
      subtotal: 100,
      desconto: 0,
      total: 100,
      data: '2026-08-13T12:00:00.000Z',
    },
    emitente: {
      cnpj: '51720322000146',
      razaoSocial: 'Sal e Fogo Braga LTDA',
      inscricaoEstadual: '0046845300054',
      crt: '1',
      logradouro: 'Rua Joviniano Ramos',
      numero: '446',
      bairro: 'São José',
      codigoMunicipio: '3143302',
      municipio: 'Montes Claros',
      uf: 'MG',
      cep: '39400347',
    },
    destinatarioNfe: {
      cpfCnpj: '11223344000186',
      nome: 'Construtora Norte Mineira LTDA',
      logradouro: 'Avenida Ovidio de Abreu',
      numero: '1200',
      bairro: 'Centro',
      codigoMunicipio: '3143302',
      municipio: 'Montes Claros',
      uf: 'MG',
      cep: '39400001',
      indicadorIe: 1,
      inscricaoEstadual: '0011223340012',
    },
    nfe: {
      naturezaOperacao: 'VENDA DE MERCADORIA',
      tipoOperacao: 1,
      finalidade: 1,
      consumidorFinal: false,
      presenca: 1,
    },
    itens: [
      {
        numeroItem: 1,
        codigoProduto: 'ESP-001',
        descricao: 'Espeto de Picanha',
        ncm: '16025000',
        cfop: '5102',
        unidadeComercial: 'UN',
        quantidade: 2,
        valorUnitario: 50,
        imposto: {
          icms: { situacao: '102', origem: 0 },
          pis: { situacao: '07' },
          cofins: { situacao: '07' },
        },
      },
    ],
    pagamentos: [{ tipo: 'dinheiro', valor: 100 }],
    valorTotal: 100,
    totais: {
      vProd: 100,
      vBC: 0,
      vICMS: 0,
      vST: 0,
      vPIS: 0,
      vCOFINS: 0,
      vNF: 100,
    },
    ...overrides,
  }) as FiscalSnapshot;

const contexto = {
  serie: 1,
  numero: 1,
  ambiente: FiscalEnvironment.HOMOLOGACAO,
};

const comoJson = (snapshot: FiscalSnapshot) =>
  snapshot as unknown as Prisma.JsonValue;

describe('buildEmitirNfeRequest', () => {
  it('monta o payload da NF-e a partir do snapshot', () => {
    const payload = buildEmitirNfeRequest(comoJson(snapshotNfe()), contexto);

    expect(payload.destinatario.cpfCnpj).toBe('11223344000186');
    expect(payload.destinatario.indicadorIe).toBe(1);
    expect(payload.tipoOperacao).toBe(1);
    expect(payload.finalidade).toBe(1);
    expect(payload.consumidorFinal).toBe(false);
    expect(payload.presenca).toBe(1);
    expect(payload.ambiente).toBe('homologacao');
  });

  it('não envia CSC — o motor recusa o campo no modelo 55', () => {
    const payload = buildEmitirNfeRequest(comoJson(snapshotNfe()), contexto);

    expect(payload).not.toHaveProperty('codigoCsc');
    expect(payload).not.toHaveProperty('idCsc');
  });

  it('recusa snapshot de NFC-e, mandando emitir documento novo', () => {
    const snapshot = snapshotNfe({
      modelo: 'NFCE',
      destinatarioNfe: undefined,
      nfe: undefined,
    });

    expect(() => buildEmitirNfeRequest(comoJson(snapshot), contexto)).toThrow(
      /não foi criado como NF-e modelo 55/,
    );
  });

  it('recusa snapshot versão 1, anterior ao quadro tributário', () => {
    const snapshot = snapshotNfe({ versao: 1 });

    expect(() => buildEmitirNfeRequest(comoJson(snapshot), contexto)).toThrow(
      BadRequestException,
    );
  });

  it('recusa série fora da faixa antes de chamar o motor', () => {
    expect(() =>
      buildEmitirNfeRequest(comoJson(snapshotNfe()), {
        ...contexto,
        serie: 1000,
      }),
    ).toThrow(/Série da NF-e deve estar entre 1 e 999/);
  });

  it('recusa total que não fecha com a soma dos itens', () => {
    const snapshot = snapshotNfe({ valorTotal: 150 });

    expect(() => buildEmitirNfeRequest(comoJson(snapshot), contexto)).toThrow(
      /diverge/,
    );
  });

  it('leva transporte e cobrança quando o snapshot os tem', () => {
    const base = snapshotNfe();
    const snapshot = snapshotNfe({
      nfe: {
        ...base.nfe!,
        transporte: { modalidade: 0, volumes: [{ quantidade: 3 }] },
        cobranca: {
          numeroFatura: '001',
          duplicatas: [
            { numero: '001/1', vencimento: '2026-09-13', valor: 100 },
          ],
        },
      },
    });

    const payload = buildEmitirNfeRequest(comoJson(snapshot), contexto);

    expect(payload.transporte?.modalidade).toBe(0);
    expect(payload.cobranca?.duplicatas).toHaveLength(1);
  });
});
