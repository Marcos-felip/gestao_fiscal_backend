import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CertificateCryptoService } from './certificate-crypto.service';

describe('CertificateCryptoService', () => {
  const key = randomBytes(32).toString('base64');
  let config: Record<string, string | undefined>;
  let service: CertificateCryptoService;

  beforeEach(async () => {
    config = { FISCAL_CERT_ENCRYPTION_KEY: key };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateCryptoService,
        {
          provide: ConfigService,
          useValue: { get: (name: string) => config[name] },
        },
      ],
    }).compile();

    service = module.get<CertificateCryptoService>(CertificateCryptoService);
  });

  it('cifra e decifra um conteúdo binário', () => {
    const pfx = randomBytes(256);

    const envelope = service.encrypt(pfx);

    expect(envelope.startsWith('v1:')).toBe(true);
    expect(envelope).not.toContain(pfx.toString('base64'));
    expect(service.decrypt(envelope).equals(pfx)).toBe(true);
    expect(service.decryptToBase64(envelope)).toBe(pfx.toString('base64'));
  });

  it('cifra e decifra a senha do certificado', () => {
    const envelope = service.encrypt('senha-do-certificado');

    expect(envelope).not.toContain('senha-do-certificado');
    expect(service.decryptToString(envelope)).toBe('senha-do-certificado');
  });

  it('gera envelopes diferentes para o mesmo conteúdo', () => {
    expect(service.encrypt('mesmo-conteudo')).not.toBe(
      service.encrypt('mesmo-conteudo'),
    );
  });

  it('aceita a chave em hexadecimal', () => {
    config.FISCAL_CERT_ENCRYPTION_KEY = randomBytes(32).toString('hex');

    expect(service.isConfigured()).toBe(true);
    expect(service.decryptToString(service.encrypt('ok'))).toBe('ok');
  });

  it('recusa envelope adulterado', () => {
    const envelope = service.encrypt('conteudo');
    const [versao, iv, tag] = envelope.split(':');
    const adulterado = [
      versao,
      iv,
      tag,
      Buffer.from('outro conteudo').toString('base64'),
    ].join(':');

    expect(() => service.decrypt(adulterado)).toThrow(
      InternalServerErrorException,
    );
  });

  it('recusa envelope em formato desconhecido', () => {
    expect(() => service.decrypt('texto-puro')).toThrow(
      InternalServerErrorException,
    );
  });

  it('reporta cofre não configurado quando falta a chave', () => {
    config.FISCAL_CERT_ENCRYPTION_KEY = undefined;

    expect(service.isConfigured()).toBe(false);
    expect(() => service.encrypt('x')).toThrow(InternalServerErrorException);
  });

  it('reporta cofre não configurado quando a chave não tem 32 bytes', () => {
    config.FISCAL_CERT_ENCRYPTION_KEY = randomBytes(16).toString('base64');

    expect(service.isConfigured()).toBe(false);
    expect(() => service.encrypt('x')).toThrow(InternalServerErrorException);
  });
});
