import { BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';
import { parsePfx } from './certificate-parser';

/** Gera um .pfx de teste com o mesmo formato de um e-CNPJ A1. */
function criarPfx(options: {
  commonName: string;
  senha: string;
  validoDe: Date;
  validoAte: Date;
}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = options.validoDe;
  cert.validity.notAfter = options.validoAte;

  const subject = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: 'ICP-Brasil' },
    { name: 'countryName', value: 'BR' },
  ];
  const issuer = [
    { name: 'commonName', value: 'AC Teste' },
    { name: 'organizationName', value: 'ICP-Brasil' },
    { name: 'countryName', value: 'BR' },
  ];

  cert.setSubject(subject);
  cert.setIssuer(issuer);
  cert.sign(keys.privateKey);

  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], options.senha);

  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

describe('parsePfx', () => {
  const senha = 'senha-forte';
  const validoDe = new Date('2026-01-01T00:00:00Z');
  const validoAte = new Date('2027-01-01T00:00:00Z');
  let pfx: Buffer;

  beforeAll(() => {
    pfx = criarPfx({
      commonName: 'EMPRESA TESTE LTDA:11222333000181',
      senha,
      validoDe,
      validoAte,
    });
  });

  it('extrai titular, documento e validade do certificado', () => {
    const parsed = parsePfx(pfx, senha);

    expect(parsed.titular).toBe('EMPRESA TESTE LTDA:11222333000181');
    expect(parsed.documento).toBe('11222333000181');
    expect(parsed.subject).toContain('EMPRESA TESTE LTDA:11222333000181');
    expect(parsed.emissor).toContain('AC Teste');
    expect(parsed.validoDe.getTime()).toBe(validoDe.getTime());
    expect(parsed.validoAte.getTime()).toBe(validoAte.getTime());
  });

  it('recusa senha incorreta', () => {
    expect(() => parsePfx(pfx, 'senha-errada')).toThrow(BadRequestException);
    expect(() => parsePfx(pfx, 'senha-errada')).toThrow(
      /Senha do certificado digital inválida/,
    );
  });

  it('recusa arquivo que não é um PKCS#12', () => {
    expect(() => parsePfx(Buffer.from('não é um certificado'), senha)).toThrow(
      /Arquivo de certificado inválido/,
    );
  });

  it('não extrai documento quando o CN não traz CNPJ', () => {
    const semDocumento = criarPfx({
      commonName: 'EMPRESA SEM DOCUMENTO',
      senha,
      validoDe,
      validoAte,
    });

    expect(parsePfx(semDocumento, senha).documento).toBeUndefined();
  });
});
