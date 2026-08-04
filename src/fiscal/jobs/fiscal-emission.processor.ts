import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
import {
  EmitirNfceRequest,
  FiscalCertificateCredentials,
} from '../fiscal-engine/fiscal-engine.interface';
import { FiscalCertificateService } from '../certificates/fiscal-certificate.service';
import { buildEmitirNfceRequest } from '../emission/emit-request.builder';
import { FISCAL_EMISSION_QUEUE } from '../../queue/queue.constants';
import { FiscalDocumentStatus } from '@prisma/client';

export interface FiscalEmissionJobData {
  fiscalDocumentId: string;
  companyId: string;
}

/**
 * Processador da fila de emissão fiscal.
 *
 * Recebe jobs com o ID do FiscalDocument, monta o XML (futuro),
 * chama o motor .NET e atualiza o status conforme o resultado.
 */
@Processor(FISCAL_EMISSION_QUEUE, {
  concurrency: 3,
  limiter: { max: 10, duration: 60_000 },
})
@Injectable()
export class FiscalEmissionProcessor extends WorkerHost {
  private readonly logger = new Logger(FiscalEmissionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: DfeNetFiscalEngine,
    private readonly certificates: FiscalCertificateService,
  ) {
    super();
  }

  async process(job: Job<FiscalEmissionJobData>): Promise<void> {
    const { fiscalDocumentId, companyId } = job.data;

    this.logger.log(
      `Processando emissão fiscal: documento=${fiscalDocumentId}, empresa=${companyId}, tentativa=${job.attemptsMade + 1}`,
    );

    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      this.logger.warn(`Documento fiscal não encontrado: ${fiscalDocumentId}`);
      return;
    }

    if (
      document.status !== FiscalDocumentStatus.PENDENTE &&
      document.status !== FiscalDocumentStatus.ERRO
    ) {
      this.logger.warn(
        `Documento ${fiscalDocumentId} não está PENDENTE nem ERRO (status=${document.status}), pulando`,
      );
      return;
    }

    // Incrementa tentativas
    await this.prisma.fiscalDocument.update({
      where: { id: fiscalDocumentId },
      data: {
        attempts: { increment: 1 },
        status: FiscalDocumentStatus.PROCESSANDO,
      },
    });

    // Adiciona histórico de transição
    await this.prisma.fiscalStatusHistory.create({
      data: {
        fiscalDocumentId,
        statusFrom: document.status,
        statusTo: FiscalDocumentStatus.PROCESSANDO,
        motivo: `Tentativa de emissão #${document.attempts + 1}`,
      },
    });

    // Payload e certificado: pré-condição inválida ou certificado vencido
    // param a emissão de vez — reprocessar não resolve.
    let request: EmitirNfceRequest;
    try {
      const settings = await this.prisma.fiscalSettings.findFirst({
        where: {
          establishmentId: document.establishmentId,
          companyId,
          deletedAt: null,
        },
      });

      const payload = buildEmitirNfceRequest(document.snapshot, {
        serie: document.serie,
        numero: document.numero,
        ambiente: document.ambiente,
        codigoCsc: settings?.codigoCsc,
        idCsc: settings?.idCsc,
      });

      // Certificado decriptado só aqui, na borda da chamada ao motor.
      const credentials: FiscalCertificateCredentials =
        await this.certificates.loadCredentials(
          companyId,
          document.establishmentId,
        );

      request = { ...payload, ...credentials };
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;

      const motivo = error.message;
      this.logger.warn(
        `Emissão bloqueada: documento=${fiscalDocumentId}, motivo=${motivo}`,
      );
      await this.registerFailure(fiscalDocumentId, motivo, {
        etapa: 'preparacao',
        tentativa: document.attempts + 1,
      });
      return;
    }

    try {
      const result = await this.engine.emitir(request);

      const newStatus = result.sucesso
        ? FiscalDocumentStatus.AUTORIZADO
        : FiscalDocumentStatus.REJEITADO;

      await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: fiscalDocumentId },
          data: {
            status: newStatus,
            protocolo: result.protocolo,
            chaveAcesso: result.chaveAcesso,
            rejeicaoCodigo: result.rejeicao?.codigo,
            rejeicaoMensagem: result.rejeicao?.mensagem,
            dataAutorizacao: result.sucesso ? new Date() : undefined,
          },
        });

        await tx.fiscalStatusHistory.create({
          data: {
            fiscalDocumentId,
            statusFrom: FiscalDocumentStatus.PROCESSANDO,
            statusTo: newStatus,
            motivo: result.sucesso
              ? `Documento autorizado: protocolo ${result.protocolo}`
              : `Rejeição: ${result.rejeicao?.codigo} - ${result.rejeicao?.mensagem}`,
          },
        });

        // Registra evento de emissão
        await tx.fiscalDocumentEvent.create({
          data: {
            fiscalDocumentId,
            tipo: 'emissao',
            detalhes: {
              sucesso: result.sucesso,
              status: newStatus,
              protocolo: result.protocolo,
              rejeicaoCodigo: result.rejeicao?.codigo,
              tentativa: document.attempts + 1,
            },
          },
        });
      });

      this.logger.log(
        `Emissão concluída: documento=${fiscalDocumentId}, status=${newStatus}`,
      );
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro inesperado na emissão: ${motivo}`);

      await this.registerFailure(
        fiscalDocumentId,
        `Erro inesperado: ${motivo}`,
      );

      throw error; // BullMQ faz retry
    }
  }

  /** Marca o documento como ERRO, com histórico e evento de auditoria. */
  private async registerFailure(
    fiscalDocumentId: string,
    motivo: string,
    detalhes?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: fiscalDocumentId },
        data: { status: FiscalDocumentStatus.ERRO },
      });

      await tx.fiscalStatusHistory.create({
        data: {
          fiscalDocumentId,
          statusFrom: FiscalDocumentStatus.PROCESSANDO,
          statusTo: FiscalDocumentStatus.ERRO,
          motivo,
        },
      });

      if (detalhes) {
        await tx.fiscalDocumentEvent.create({
          data: {
            fiscalDocumentId,
            tipo: 'emissao',
            detalhes: { sucesso: false, motivo, ...detalhes },
          },
        });
      }
    });
  }
}
