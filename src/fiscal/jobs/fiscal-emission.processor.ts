import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
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

    try {
      // TODO: Fase B — montar XML assinado a partir do snapshot + produtos
      // Por agora, o engine recebe um payload mínimo para teste de integração
      const result = await this.engine.emitir({
        idempotencyKey: document.idempotencyKey ?? document.id,
        ambiente: document.ambiente,
        xml: document.xmlEnviado ?? '',
        modelo: document.modelo,
        serie: document.serie,
        numero: document.numero,
      });

      const newStatus = result.success
        ? FiscalDocumentStatus.AUTORIZADO
        : result.rejeicaoCodigo
          ? FiscalDocumentStatus.REJEITADO
          : FiscalDocumentStatus.ERRO;

      await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: fiscalDocumentId },
          data: {
            status: newStatus,
            protocolo: result.protocolo,
            chaveAcesso: result.chaveAcesso,
            xmlAutorizado: result.xmlAutorizado,
            rejeicaoCodigo: result.rejeicaoCodigo,
            rejeicaoMensagem: result.rejeicaoMensagem,
            dataAutorizacao: result.success ? new Date() : undefined,
          },
        });

        await tx.fiscalStatusHistory.create({
          data: {
            fiscalDocumentId,
            statusFrom: FiscalDocumentStatus.PROCESSANDO,
            statusTo: newStatus,
            motivo: result.success
              ? `Documento autorizado: protocolo ${result.protocolo}`
              : `Rejeição: ${result.rejeicaoCodigo} - ${result.rejeicaoMensagem}`,
          },
        });

        // Registra evento de emissão
        await tx.fiscalDocumentEvent.create({
          data: {
            fiscalDocumentId,
            tipo: 'emissao',
            detalhes: {
              success: result.success,
              status: newStatus,
              protocolo: result.protocolo,
              rejeicaoCodigo: result.rejeicaoCodigo,
              tentativa: document.attempts + 1,
            },
          },
        });
      });

      this.logger.log(
        `Emissão concluída: documento=${fiscalDocumentId}, status=${newStatus}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro inesperado na emissão: ${error instanceof Error ? error.message : String(error)}`,
      );

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
            motivo: `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      });

      throw error; // BullMQ faz retry
    }
  }
}
