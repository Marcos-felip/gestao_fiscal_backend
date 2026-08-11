import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment } from '@prisma/client';
import {
  assertEmissionSettings,
  buildProductionChecklist,
  checkEmissionSettings,
} from './fiscal-preconditions';

const amanha = new Date(Date.now() + 86_400_000);
const ontem = new Date(Date.now() - 86_400_000);

/** CSC no formato que MG emite: 32 caracteres hexadecimais. Valor fictício. */
const CSC_VALIDO = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

const settings = (overrides: Record<string, unknown> = {}) => ({
  codigoCsc: CSC_VALIDO,
  idCsc: '000001',
  certificadoRef: 'enc(pfx)',
  certificadoSenhaRef: 'enc(senha)',
  certificadoValidade: amanha,
  ...overrides,
});

describe('checkEmissionSettings', () => {
  it('não aponta pendência com CSC e certificado válidos', () => {
    expect(checkEmissionSettings(settings())).toEqual([]);
  });

  it('cobra o CSC quando falta código ou ID', () => {
    expect(checkEmissionSettings(settings({ codigoCsc: null }))).toContain(
      'configure o CSC e o ID do CSC do estabelecimento',
    );
    expect(checkEmissionSettings(settings({ idCsc: '  ' }))).toContain(
      'configure o CSC e o ID do CSC do estabelecimento',
    );
  });

  it('distingue CSC malformado de CSC ausente', () => {
    const pendencias = checkEmissionSettings(settings({ codigoCsc: '123456' }));

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]).toMatch(/fora do formato esperado/);
    expect(pendencias[0]).not.toMatch(/configure o CSC/);
  });

  it('aponta o ID do CSC malformado sem cobrar o código', () => {
    const pendencias = checkEmissionSettings(settings({ idCsc: 'ABC' }));

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]).toMatch(/ID do CSC.*fora do formato/);
  });

  it('não repete o valor do CSC na mensagem', () => {
    const pendencias = checkEmissionSettings(settings({ codigoCsc: '123456' }));

    expect(pendencias.join(' ')).not.toContain('123456');
  });

  it('cobra o certificado quando não foi enviado', () => {
    expect(checkEmissionSettings(settings({ certificadoRef: null }))).toContain(
      'envie o certificado digital A1 do estabelecimento',
    );
  });

  it('aponta o certificado vencido com a data', () => {
    const pendencias = checkEmissionSettings(
      settings({ certificadoValidade: ontem }),
    );

    expect(pendencias[0]).toMatch(/certificado digital venceu em/);
  });

  it('acumula todas as pendências de uma vez', () => {
    expect(
      checkEmissionSettings(
        settings({ codigoCsc: null, certificadoRef: null }),
      ),
    ).toHaveLength(2);
  });
});

describe('assertEmissionSettings', () => {
  it('passa quando não há pendência', () => {
    expect(() => assertEmissionSettings(settings())).not.toThrow();
  });

  it('interrompe com 400 e mensagem em português', () => {
    expect(() => assertEmissionSettings(settings({ idCsc: null }))).toThrow(
      BadRequestException,
    );
    expect(() => assertEmissionSettings(settings({ idCsc: null }))).toThrow(
      /Não é possível emitir a NFC-e/,
    );
  });
});

describe('produção liberada', () => {
  it('bloqueia a emissão em produção sem liberação', () => {
    expect(
      checkEmissionSettings(
        settings({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: false,
        }),
      ),
    ).toEqual([expect.stringContaining('libere a emissão em produção')]);
  });

  it('libera a emissão em produção depois do checklist', () => {
    expect(
      checkEmissionSettings(
        settings({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
        }),
      ),
    ).toEqual([]);
  });

  it('não exige liberação em homologação', () => {
    expect(
      checkEmissionSettings(
        settings({
          ambiente: FiscalEnvironment.HOMOLOGACAO,
          producaoLiberada: false,
        }),
      ),
    ).toEqual([]);
  });
});

describe('buildProductionChecklist', () => {
  const producao = (overrides: Record<string, unknown> = {}) => ({
    ...settings(),
    serieNfce: 1,
    proximoNumeroNfce: 1,
    consultaPublicaValidadaEm: new Date('2026-08-04T12:00:00Z'),
    ...overrides,
  });

  const pendentes = (config: Record<string, unknown> = {}) =>
    buildProductionChecklist(producao(config))
      .filter((item) => !item.ok)
      .map((item) => item.item);

  it('aprova a configuração completa', () => {
    expect(pendentes()).toEqual([]);
  });

  it('devolve todos os itens, inclusive os já concluídos', () => {
    expect(buildProductionChecklist(producao())).toHaveLength(6);
  });

  it('aponta certificado ausente', () => {
    expect(pendentes({ certificadoRef: null })).toEqual([
      'Certificado digital A1 enviado',
      'Certificado dentro da validade',
    ]);
  });

  it('aponta certificado vencido', () => {
    expect(pendentes({ certificadoValidade: ontem })).toEqual([
      'Certificado dentro da validade',
    ]);
  });

  it('aponta CSC de produção ausente', () => {
    expect(pendentes({ codigoCsc: null })).toEqual([
      'CSC e ID do CSC de produção configurados',
    ]);
  });

  it.each([
    ['série fora da faixa', { serieNfce: 1000 }, 'Série entre 1 e 999'],
    [
      'numeração zerada',
      { proximoNumeroNfce: 0 },
      'Próximo número entre 1 e 999999999',
    ],
  ])('aponta %s', (_caso, override, esperado) => {
    expect(pendentes(override)).toEqual([esperado]);
  });

  it('aponta consulta pública não validada', () => {
    expect(pendentes({ consultaPublicaValidadaEm: null })).toEqual([
      'Consulta pública validada em produção',
    ]);
  });

  it('aprova consulta pública quando já foi validada', () => {
    expect(
      pendentes({
        consultaPublicaValidadaEm: new Date('2026-08-04T12:00:00Z'),
      }),
    ).toEqual([]);
  });
});
