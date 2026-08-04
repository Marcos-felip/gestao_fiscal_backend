import { BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';

/** Dados extraídos do certificado A1 para exibição e controle de validade. */
export interface ParsedCertificate {
  /** Subject DN completo (ex.: `CN=EMPRESA:11222333000181, OU=..., C=BR`) */
  subject: string;
  /** Common Name do titular */
  titular: string;
  /** CNPJ/CPF embutido no CN, quando presente */
  documento?: string;
  validoDe: Date;
  validoAte: Date;
  emissor: string;
}

/**
 * Lê um certificado A1 (.pfx/.p12) e extrai titular e validade.
 *
 * A leitura também serve de validação: se a senha estiver errada ou o arquivo
 * não for um PKCS#12, o `node-forge` falha e a exceção vira 400.
 */
export function parsePfx(pfx: Buffer, senha: string): ParsedCertificate {
  const certificate = extractCertificate(pfx, senha);

  const subject = formatDn(certificate.subject.attributes);
  const titular = readAttribute(certificate.subject.attributes, 'commonName');

  return {
    subject,
    titular,
    documento: extractDocumento(titular),
    validoDe: certificate.validity.notBefore,
    validoAte: certificate.validity.notAfter,
    emissor: formatDn(certificate.issuer.attributes),
  };
}

/** Abre o PKCS#12 e devolve o certificado do titular. */
function extractCertificate(pfx: Buffer, senha: string): forge.pki.Certificate {
  let p12: forge.pkcs12.Pkcs12Pfx;

  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(pfx.toString('binary')),
    );
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  } catch (error) {
    throw new BadRequestException(
      isPasswordError(error)
        ? 'Senha do certificado digital inválida'
        : 'Arquivo de certificado inválido — envie um certificado A1 no formato .pfx/.p12',
    );
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ];

  const certificates = (bags ?? [])
    .map((bag) => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => !!cert);

  if (certificates.length === 0) {
    throw new BadRequestException(
      'Certificado digital sem cadeia válida no arquivo enviado',
    );
  }

  // O certificado do titular é o que não assina a si mesmo (os demais são da cadeia ICP-Brasil).
  const titular = certificates.find(
    (cert) =>
      formatDn(cert.subject.attributes) !== formatDn(cert.issuer.attributes),
  );

  return titular ?? certificates[0];
}

/** O forge não tipa o erro de senha; ele chega como `{ message }` conhecido. */
function isPasswordError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';

  return /invalid password|mac could not be verified|integrity/i.test(message);
}

function formatDn(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .map((attribute) => {
      const nome = attribute.shortName ?? attribute.name ?? '?';
      return `${nome}=${String(attribute.value ?? '')}`;
    })
    .join(', ');
}

function readAttribute(
  attributes: forge.pki.CertificateField[],
  name: string,
): string {
  const attribute = attributes.find((item) => item.name === name);
  return String(attribute?.value ?? '');
}

/**
 * Certificados e-CNPJ/e-CPF trazem o documento no CN, após os dois-pontos
 * (ex.: `EMPRESA TESTE LTDA:11222333000181`).
 */
function extractDocumento(commonName: string): string | undefined {
  const match = /:(\d{11}|\d{14})$/.exec(commonName.trim());
  return match ? match[1] : undefined;
}
