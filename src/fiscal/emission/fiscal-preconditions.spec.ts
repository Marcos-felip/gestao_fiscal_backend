import { BadRequestException } from '@nestjs/common';
import {
  assertEmissionSettings,
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
