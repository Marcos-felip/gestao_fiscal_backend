import { TaxRegimeCode } from '@prisma/client';
import { NfceItemImposto } from '../fiscal-engine/fiscal-engine.interface';
import {
  camposExigidosIcms,
  formaDaContribuicao,
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
  validarQuadroTributario,
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
  // 07 é o que o backfill gravou: situação não tributada, sem alíquota.
  cstPis: '07',
  cstCofins: '07',
  aliquotaPis: null,
  aliquotaCofins: null,
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
    ['CSOSN inexistente', { csosn: '199' }],
    ['sem situação tributária', { csosn: null }],
    ['sem CST de PIS', { cstPis: null }],
    ['sem CST de COFINS', { cstCofins: null }],
    ['CST de PIS inexistente', { cstPis: '77' }],
  ])('recusa produto com %s', (_campo, override) => {
    expect(isProductFiscalComplete(produto(override))).toBe(false);
  });

  it('aceita CSOSN que o motor passou a suportar', () => {
    // 101 era recusado quando a lista era "os que se resolvem sem valores".
    expect(
      isProductFiscalComplete(
        produto({ csosn: '101' }),
        TaxRegimeCode.SIMPLES_NACIONAL,
      ),
    ).toBe(true);
  });

  it('exige alíquota quando o CST de PIS é tributado por percentual', () => {
    expect(
      isProductFiscalComplete(produto({ cstPis: '01', aliquotaPis: null })),
    ).toBe(false);
    expect(
      isProductFiscalComplete(produto({ cstPis: '01', aliquotaPis: 1.65 })),
    ).toBe(true);
  });

  it('nomeia o que falta de PIS e COFINS', () => {
    expect(produto({ cstPis: null, cstCofins: null })).toBeDefined();
    expect(
      listarPendenciasFiscais(produto({ cstPis: null, cstCofins: null })),
    ).toEqual([
      'CST de PIS ausente ou não reconhecido',
      'CST de COFINS ausente ou não reconhecido',
    ]);
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

describe('camposExigidosIcms', () => {
  it.each([
    ['102', []],
    ['103', []],
    ['300', []],
    ['400', []],
    ['40', []],
    ['41', []],
    ['50', []],
  ])('a situação %s não exige campo nenhum', (situacao, esperado) => {
    expect(camposExigidosIcms(situacao)).toEqual(esperado);
  });

  it.each([
    ['00', ['modBC', 'vBC', 'pICMS', 'vICMS']],
    ['20', ['modBC', 'pRedBC', 'vBC', 'pICMS', 'vICMS']],
    ['60', ['vBCSTRet', 'vICMSSTRet']],
    ['101', ['pCredSN', 'vCredICMSSN']],
    ['500', ['vBCSTRet', 'vICMSSTRet']],
    ['900', ['modBC', 'vBC', 'pICMS', 'vICMS']],
  ])('a situação %s exige os campos do grupo', (situacao, esperado) => {
    expect(camposExigidosIcms(situacao)).toEqual(esperado);
  });

  it('devolve undefined para situação que não existe', () => {
    expect(camposExigidosIcms('199')).toBeUndefined();
    expect(camposExigidosIcms(null)).toBeUndefined();
  });
});

describe('formaDaContribuicao', () => {
  it.each([
    ['01', 'percentual'],
    ['02', 'percentual'],
    ['03', 'quantidade'],
    ['07', 'nenhuma'],
    ['49', 'qualquer'],
    ['99', 'qualquer'],
  ])('resolve a forma de apuração do CST %s', (cst, esperado) => {
    expect(formaDaContribuicao(cst)).toBe(esperado);
  });

  it('devolve undefined para CST que não existe', () => {
    expect(formaDaContribuicao('77')).toBeUndefined();
    expect(formaDaContribuicao(null)).toBeUndefined();
  });
});

describe('validarQuadroTributario', () => {
  const quadro = (overrides: Partial<NfceItemImposto> = {}): NfceItemImposto =>
    ({
      icms: { situacao: '102', origem: 0 },
      pis: { situacao: '07' },
      cofins: { situacao: '07' },
      ...overrides,
    }) as NfceItemImposto;

  it('aceita o quadro do Simples com CSOSN 102 e contribuições não tributadas', () => {
    expect(validarQuadroTributario(quadro(), 'item 1')).toEqual([]);
  });

  it('recusa situação de ICMS que não existe, nomeando o código', () => {
    const problemas = validarQuadroTributario(
      quadro({ icms: { situacao: '199', origem: 0 } }),
      'item 1',
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('199');
  });

  it('nomeia os campos que a situação exige e não vieram', () => {
    const problemas = validarQuadroTributario(
      quadro({ icms: { situacao: '00', origem: 0 } }),
      'item 1 (Refrigerante)',
    );

    expect(problemas[0]).toBe(
      'item 1 (Refrigerante): a situação de ICMS 00 exige modBC, vBC, pICMS, vICMS',
    );
  });

  it('recusa base de ICMS sem alíquota', () => {
    const problemas = validarQuadroTributario(
      quadro({ icms: { situacao: '102', origem: 0, vBC: 10 } }),
      'item 1',
    );

    expect(problemas).toContain(
      'item 1: informe base de cálculo e alíquota de ICMS juntas',
    );
  });

  it('recusa origem fora da faixa', () => {
    const problemas = validarQuadroTributario(
      quadro({ icms: { situacao: '102', origem: 9 } }),
      'item 1',
    );

    expect(problemas).toContain(
      'item 1: origem da mercadoria ausente ou fora de 0 a 8',
    );
  });

  it('recusa contribuição não tributada que trouxe valores', () => {
    const problemas = validarQuadroTributario(
      quadro({ pis: { situacao: '07', vBC: 10, pPIS: 1.65, vPIS: 0.17 } }),
      'item 1',
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/não é tributado/);
  });

  it('exige base, alíquota e valor no CST tributado por percentual', () => {
    const problemas = validarQuadroTributario(
      quadro({ pis: { situacao: '01' } }),
      'item 1',
    );

    expect(problemas).toEqual([
      'item 1: o CST de PIS 01 exige base de cálculo e alíquota',
      'item 1: informe o valor de PIS',
    ]);
  });

  it('aceita a apuração por quantidade', () => {
    const problemas = validarQuadroTributario(
      quadro({
        pis: { situacao: '03', qBCProd: 2, vAliqProd: 0.05, vPIS: 0.1 },
        cofins: {
          situacao: '03',
          qBCProd: 2,
          vAliqProd: 0.23,
          vCOFINS: 0.46,
        },
      }),
      'item 1',
    );

    expect(problemas).toEqual([]);
  });

  it('recusa as duas formas de apuração ao mesmo tempo', () => {
    const problemas = validarQuadroTributario(
      quadro({
        pis: {
          situacao: '99',
          vBC: 10,
          pPIS: 1.65,
          qBCProd: 2,
          vAliqProd: 0.05,
          vPIS: 0.17,
        },
      }),
      'item 1',
    );

    expect(problemas).toContain(
      'item 1: o CST de PIS 99 não aceita as duas formas de apuração ao mesmo tempo',
    );
  });

  it('recusa CST de COFINS que não existe', () => {
    const problemas = validarQuadroTributario(
      quadro({ cofins: { situacao: '77' } }),
      'item 1',
    );

    expect(problemas[0]).toContain('COFINS');
    expect(problemas[0]).toContain('77');
  });
});
