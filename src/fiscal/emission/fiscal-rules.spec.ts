import { TaxRegimeCode } from '@prisma/client';
import {
  isCompanyFiscalComplete,
  isCpfCnpjValido,
  isCscValido,
  isIdCscValido,
  isInscricaoEstadualValida,
  isProductFiscalComplete,
  isUfValida,
  listarPendenciasFiscais,
  mapCrt,
  situacaoTributaria,
  usaCsosn,
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

describe('isCscValido', () => {
  it('aceita o CSC de 32 hexadecimais que MG emite', () => {
    expect(isCscValido('A1B2C3D4E5F60718293A4B5C6D7E8F90')).toBe(true);
  });

  it.each([
    ['no mínimo de 16', '1234567890123456'],
    ['no máximo de 64', 'a'.repeat(64)],
    ['misturando letras e números', 'abcDEF1234567890xyz'],
    ['com espaço em volta', '  1234567890123456  '],
  ])('aceita CSC %s', (_caso, csc) => {
    expect(isCscValido(csc)).toBe(true);
  });

  // O CSC de 6 dígitos é o caso real da rejeição 464 de 10/08/2026.
  it.each([
    ['de 6 dígitos', '123456'],
    ['com 15 caracteres', '123456789012345'],
    ['acima de 64', 'a'.repeat(65)],
    ['com hífen', 'ABCD-EFGH-IJKL-MNOP-QRST'],
    ['com espaço no meio', '12345678 90123456'],
    ['vazio', ''],
    ['só espaços', '   '],
    ['nulo', null],
    ['indefinido', undefined],
  ])('recusa CSC %s', (_caso, csc) => {
    expect(isCscValido(csc)).toBe(false);
  });
});

describe('isIdCscValido', () => {
  it.each(['1', '000001', '123456'])('aceita %s', (id) => {
    expect(isIdCscValido(id)).toBe(true);
  });

  it.each([
    ['com letras', 'ABC'],
    ['com 7 dígitos', '1234567'],
    ['com pontuação', '00-01'],
    ['vazio', ''],
    ['nulo', null],
    ['indefinido', undefined],
  ])('recusa ID %s', (_caso, id) => {
    expect(isIdCscValido(id)).toBe(false);
  });
});

describe('mapCrt', () => {
  it.each([
    [TaxRegimeCode.SIMPLES_NACIONAL, '1'],
    [TaxRegimeCode.SIMPLES_EXCESSO, '2'],
    [TaxRegimeCode.REGIME_NORMAL, '3'],
    [TaxRegimeCode.SIMPLES_MEI, '4'],
  ])('mapeia %s para CRT %s', (regime, esperado) => {
    expect(mapCrt(regime)).toBe(esperado);
  });
});

describe('usaCsosn', () => {
  // O MEI é Simples Nacional com enquadramento próprio: tributa por CSOSN.
  // Só o Regime Normal usa CST de ICMS.
  it.each(['1', '2', '4'] as const)('CRT %s usa CSOSN', (crt) => {
    expect(usaCsosn(crt)).toBe(true);
  });

  it('CRT 3 usa CST de ICMS', () => {
    expect(usaCsosn('3')).toBe(false);
  });
});

describe('situacaoTributaria com CRT 4 (MEI)', () => {
  it('aceita CSOSN do emitente MEI', () => {
    expect(situacaoTributaria('4', '102', null)).toBe('102');
  });

  it('ignora CST de ICMS quando o emitente é MEI', () => {
    expect(situacaoTributaria('4', null, '40')).toBeUndefined();
  });
});

describe('isProductFiscalComplete com CRT 4 (MEI)', () => {
  it('considera completo o produto com CSOSN suportado', () => {
    expect(isProductFiscalComplete(produto(), TaxRegimeCode.SIMPLES_MEI)).toBe(
      true,
    );
  });

  it('cobra CSOSN, não CST, quando o emitente é MEI', () => {
    const pendencias = listarPendenciasFiscais(
      produto({ csosn: null, cstIcms: '40' }),
      TaxRegimeCode.SIMPLES_MEI,
    );

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]).toMatch(/CSOSN/);
  });
});
