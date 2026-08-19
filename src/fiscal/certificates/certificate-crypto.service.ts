import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Marca a versão do envelope para permitir rotação de algoritmo depois. */
const ENVELOPE_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Cofre local do certificado A1.
 *
 * O certificado (.pfx) e a senha nunca são gravados em texto claro: ficam
 * cifrados em AES-256-GCM com a chave de `FISCAL_CERT_ENCRYPTION_KEY` e são
 * decriptados só na borda da chamada ao motor fiscal.
 *
 * Formato do envelope: `v1:<iv>:<tag>:<conteúdo>` — todas as partes em base64.
 *
 * A chave deve ter 32 bytes, em base64 ou hexadecimal. Gerar com:
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 */
@Injectable()
export class CertificateCryptoService {
  constructor(private readonly configService: ConfigService) {}

  /** Indica se o cofre está configurado — usado para falhar cedo com mensagem clara. */
  isConfigured(): boolean {
    const raw = this.configService.get<string>('FISCAL_CERT_ENCRYPTION_KEY');
    return !!raw && this.decodeKey(raw) !== null;
  }

  /** Cifra um conteúdo sensível e devolve o envelope pronto para o banco. */
  encrypt(plain: string | Buffer): string {
    const key = this.key();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const content = Buffer.concat([
      cipher.update(
        Buffer.isBuffer(plain) ? plain : Buffer.from(plain, 'utf8'),
      ),
      cipher.final(),
    ]);

    return [
      ENVELOPE_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      content.toString('base64'),
    ].join(':');
  }

  /** Decifra um envelope gerado por {@link encrypt}. */
  decrypt(envelope: string): Buffer {
    const parts = envelope.split(':');

    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
      throw new InternalServerErrorException(
        'Certificado armazenado em formato desconhecido',
      );
    }

    const [, iv, tag, content] = parts;

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key(),
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(content, 'base64')),
        decipher.final(),
      ]);
    } catch {
      throw new InternalServerErrorException(
        'Não foi possível decifrar o certificado — a chave de criptografia mudou?',
      );
    }
  }

  /** Decifra um envelope e devolve o conteúdo como texto. */
  decryptToString(envelope: string): string {
    return this.decrypt(envelope).toString('utf8');
  }

  /** Decifra um envelope e devolve o conteúdo em base64 (formato do motor). */
  decryptToBase64(envelope: string): string {
    return this.decrypt(envelope).toString('base64');
  }

  private key(): Buffer {
    const raw = this.configService.get<string>('FISCAL_CERT_ENCRYPTION_KEY');

    if (!raw) {
      throw new InternalServerErrorException(
        'FISCAL_CERT_ENCRYPTION_KEY não configurada — o certificado digital não pode ser armazenado',
      );
    }

    const key = this.decodeKey(raw);

    if (!key) {
      throw new InternalServerErrorException(
        'FISCAL_CERT_ENCRYPTION_KEY inválida — informe 32 bytes em base64 ou hexadecimal',
      );
    }

    return key;
  }

  /** Aceita a chave em hexadecimal ou base64; devolve `null` se não tiver 32 bytes. */
  private decodeKey(raw: string): Buffer | null {
    const value = raw.trim();

    const candidates = [
      /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : null,
      Buffer.from(value, 'base64'),
    ];

    return candidates.find((buf) => buf?.length === KEY_BYTES) ?? null;
  }
}
