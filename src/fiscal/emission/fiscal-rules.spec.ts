import { TaxRegimeCode } from '@prisma/client';
import {
  isCompanyFiscalComplete,
  isCpfCnpjValido,
  isInscricaoEstadualValida,
  isProductFiscalComplete,
  isUfValida,
} from './fiscal-rules';

const empresa = (overrides: Record<string, unknown> = {}) => ({
  cnpj: '11.222.333/0001-81',
  razaoSocial: 'Empresa Teste LTDA',
  inscricaoEstadual: '123456789',
  crt: TaxRegimeCode.SIMPLES_NACIONAL,
  codigoIbgeMunicipio: '3550308',
  ...overrides,
});

const produto = (overrides: Record<string, unknown> = {}) => ({
  ncm: '22021000',
  cfop: '5102',
  origin: 0,
  csosn: '102',
  cstIcms: null,
  ...overrides,
});

describe('isCompanyFiscalComplete', () => {
  it('aceita empresa com identificação, regime e município', () => {
    expect(isCompanyFiscalComplete(empresa())).toBe(true);
  });

  it.each([
    ['CNPJ', { cnpj: null }],
    ['razão social', { razaoSocial: '' }],
    ['inscrição estadual', { inscricaoEstadual: null }],
    ['CRT', { crt: null }],
    ['código IBGE', { codigoIbgeMunicipio: '355' }],
  ])('recusa empresa sem %s', (_campo, override) => {
    expect(isCompanyFiscalComplete(empresa(override))).toBe(false);
  });
});

describe('isProductFiscalComplete', () => {
  it('aceita produto do Simples com CSOSN suportado', () => {
    expect(
      isProductFiscalComplete(produto(), TaxRegimeCode.SIMPLES_NACIONAL),
    ).toBe(true);
  });

  it('aceita produto do regime normal com CST suportado', () => {
    expect(
      isProductFiscalComplete(
        produto({ csosn: null, cstIcms: '40' }),
        TaxRegimeCode.REGIME_NORMAL,
      ),
    ).toBe(true);
  });

  it('recusa CSOSN válido quando o regime exige CST', () => {
    expect(
      isProductFiscalComplete(produto(), TaxRegimeCode.REGIME_NORMAL),
    ).toBe(false);
  });

  it('aceita qualquer um dos dois quando o CRT é desconhecido', () => {
    expect(isProductFiscalComplete(produto())).toBe(true);
    expect(
      isProductFiscalComplete(produto({ csosn: null, cstIcms: '50' })),
    ).toBe(true);
  });

  it.each([
    ['NCM com menos de 8 dígitos', { ncm: '2202' }],
    ['CFOP que não começa com 5', { cfop: '6102' }],
    ['origem fora da faixa', { origin: 9 }],
    ['CSOSN não suportado pelo motor', { csosn: '101' }],
    ['sem situação tributária', { csosn: null }],
  ])('recusa produto com %s', (_campo, override) => {
    expect(isProductFiscalComplete(produto(override))).toBe(false);
  });
});

describe('isCpfCnpjValido', () => {
  it.each([
    ['CPF com máscara', '390.533.447-05'],
    ['CPF sem máscara', '39053344705'],
    ['CNPJ com máscara', '11.222.333/0001-81'],
    ['CNPJ sem máscara', '11222333000181'],
  ])('aceita %s', (_caso, valor) => {
    expect(isCpfCnpjValido(valor)).toBe(true);
  });

  it.each([
    ['dígito verificador errado no CPF', '39053344700'],
    ['dígito verificador errado no CNPJ', '11222333000100'],
    ['todos os dígitos iguais', '11111111111'],
    ['quantidade de dígitos inválida', '123456'],
    ['vazio', ''],
    ['nulo', null],
  ])('recusa %s', (_caso, valor) => {
    expect(isCpfCnpjValido(valor)).toBe(false);
  });
});

describe('isUfValida', () => {
  it.each(['SP', 'sp', ' MG ', 'BA'])('aceita %s', (uf) => {
    expect(isUfValida(uf)).toBe(true);
  });

  it.each(['XX', 'S', 'SAO', '', null])('recusa %s', (uf) => {
    expect(isUfValida(uf)).toBe(false);
  });
});

describe('isInscricaoEstadualValida', () => {
  it.each(['123456789012', '12', '12345678901234'])('aceita %s', (ie) => {
    expect(isInscricaoEstadualValida(ie)).toBe(true);
  });

  it.each([
    ['acima de 14 dígitos', '123456789012345'],
    ['com menos de 2 dígitos', '1'],
    ['vazia', ''],
    ['nula', null],
  ])('recusa IE %s', (_caso, ie) => {
    expect(isInscricaoEstadualValida(ie)).toBe(false);
  });
});
