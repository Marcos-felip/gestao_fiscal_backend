import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment } from '@prisma/client';
import {
  assertEmissionSettings,
  buildProductionChecklist,
  checkEmissionSettings,
} from './fiscal-preconditions';

const amanha = new Date(Date.now() + 86_400_000);
const ontem = new Date(Date.now() - 86_400_000);

const settings = (overrides: Record<string, unknown> = {}) => ({
  codigoCsc: 'CSC123',
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
    expect(buildProductionChecklist(producao())).toHaveLength(5);
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
});
