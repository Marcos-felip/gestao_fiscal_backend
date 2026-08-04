import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CertificateCryptoService } from './certificate-crypto.service';
import { parsePfx } from './certificate-parser';
import { FiscalCertificateCredentials } from '../fiscal-engine/fiscal-engine.interface';

/** Situação do certificado exposta na configuração fiscal. */
export interface CertificateStatus {
  configurado: boolean;
  titular?: string;
  subject?: string;
  validoAte?: Date;
  /** Negativo quando já venceu */
  diasParaVencer?: number;
  vencido: boolean;
}

/** Tamanho máximo aceito para o arquivo .pfx. */
export const MAX_CERTIFICATE_BYTES = 512 * 1024;

/**
 * Guarda do certificado A1 do estabelecimento.
 *
 * O .pfx e a senha entram por upload, são validados na hora (a leitura só
 * funciona com a senha correta), ficam cifrados no banco e só voltam a texto
 * claro em {@link loadCredentials}, na borda da chamada ao motor fiscal.
 * Nem o arquivo nem a senha aparecem em log ou em resposta de API.
 */
@Injectable()
export class FiscalCertificateService {
  private readonly logger = new Logger(FiscalCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CertificateCryptoService,
  ) {}

  /**
   * Registra (ou substitui) o certificado A1 do estabelecimento.
   *
   * A substituição fica registrada em `fiscal_certificate_events` com o
   * certificado anterior, o novo titular e quem trocou.
   */
  async upload(
    companyId: string,
    establishmentId: string,
    pfx: Buffer,
    senha: string,
    userId?: string,
  ): Promise<CertificateStatus> {
    if (!pfx || pfx.length === 0) {
      throw new BadRequestException('Envie o arquivo do certificado digital');
    }

    if (pfx.length > MAX_CERTIFICATE_BYTES) {
      throw new BadRequestException(
        `Certificado digital acima do limite de ${Math.floor(MAX_CERTIFICATE_BYTES / 1024)} KB`,
      );
    }

    if (!this.crypto.isConfigured()) {
      throw new BadRequestException(
        'Cofre de certificados indisponível — configure FISCAL_CERT_ENCRYPTION_KEY',
      );
    }

    const settings = await this.requireSettings(companyId, establishmentId);
    const parsed = parsePfx(pfx, senha);

    if (parsed.validoAte.getTime() <= Date.now()) {
      throw new BadRequestException(
        `Certificado digital vencido em ${parsed.validoAte.toLocaleDateString('pt-BR')}`,
      );
    }

    const substituicao = !!settings.certificadoRef;

    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalSettings.update({
        where: { id: settings.id },
        data: {
          certificadoRef: this.crypto.encrypt(pfx),
          certificadoSenhaRef: this.crypto.encrypt(senha),
          certificadoValidade: parsed.validoAte,
          certificadoSubject: parsed.subject,
        },
      });

      await tx.fiscalCertificateEvent.create({
        data: {
          companyId,
          fiscalSettingsId: settings.id,
          tipo: substituicao ? 'substituicao' : 'upload',
          subject: parsed.subject,
          titular: parsed.titular,
          validoAte: parsed.validoAte,
          subjectAnterior: substituicao ? settings.certificadoSubject : null,
          usuarioId: userId,
        },
      });
    });

    this.logger.log(
      `Certificado ${substituicao ? 'substituído' : 'cadastrado'}: estabelecimento=${establishmentId}, titular=${parsed.titular}, validade=${parsed.validoAte.toISOString()}`,
    );

    return this.buildStatus(parsed.subject, parsed.titular, parsed.validoAte);
  }

  /** Situação do certificado, sem expor o arquivo nem a senha. */
  async getStatus(
    companyId: string,
    establishmentId: string,
  ): Promise<CertificateStatus> {
    const settings = await this.requireSettings(companyId, establishmentId);

    if (!settings.certificadoRef || !settings.certificadoValidade) {
      return { configurado: false, vencido: false };
    }

    return this.buildStatus(
      settings.certificadoSubject ?? undefined,
      undefined,
      settings.certificadoValidade,
    );
  }

  /**
   * Decripta o certificado para a chamada ao motor fiscal.
   *
   * Bloqueia a emissão quando não há certificado ou quando ele já venceu —
   * a SEFAZ recusaria a assinatura de qualquer forma.
   */
  async loadCredentials(
    companyId: string,
    establishmentId: string,
  ): Promise<FiscalCertificateCredentials> {
    const settings = await this.requireSettings(companyId, establishmentId);

    if (!settings.certificadoRef || !settings.certificadoSenhaRef) {
      throw new BadRequestException(
        'Certificado digital não configurado para este estabelecimento',
      );
    }

    if (
      settings.certificadoValidade &&
      settings.certificadoValidade.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        `Certificado digital vencido em ${settings.certificadoValidade.toLocaleDateString('pt-BR')} — envie um novo certificado para voltar a emitir`,
      );
    }

    return {
      certificadoBase64: this.crypto.decryptToBase64(settings.certificadoRef),
      certificadoSenha: this.crypto.decryptToString(
        settings.certificadoSenhaRef,
      ),
    };
  }

  /** Histórico de envio/substituição do certificado do estabelecimento. */
  async getHistory(companyId: string, establishmentId: string) {
    const settings = await this.requireSettings(companyId, establishmentId);

    return this.prisma.fiscalCertificateEvent.findMany({
      where: { companyId, fiscalSettingsId: settings.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireSettings(companyId: string, establishmentId: string) {
    const settings = await this.prisma.fiscalSettings.findFirst({
      where: { establishmentId, companyId, deletedAt: null },
    });

    if (!settings) {
      throw new NotFoundException(
        'Configuração fiscal não encontrada para este estabelecimento',
      );
    }

    return settings;
  }

  private buildStatus(
    subject: string | undefined,
    titular: string | undefined,
    validoAte: Date,
  ): CertificateStatus {
    const diasParaVencer = Math.ceil(
      (validoAte.getTime() - Date.now()) / 86_400_000,
    );

    return {
      configurado: true,
      titular,
      subject,
      validoAte,
      diasParaVencer,
      vencido: diasParaVencer <= 0,
    };
  }
}
