import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
import {
  EmitirNfceRequest,
  EmitirNfceResult,
  FiscalCertificateCredentials,
} from '../fiscal-engine/fiscal-engine.interface';
import { FiscalCertificateService } from '../certificates/fiscal-certificate.service';
import { buildEmitirNfceRequest } from '../emission/emit-request.builder';
import { buildFiscalStorageKey } from '../emission/fiscal-storage';
import { StorageService } from '../../storage/storage.service';
import { FISCAL_EMISSION_QUEUE } from '../../queue/queue.constants';
import { FiscalDocumentStatus, FiscalStatus } from '@prisma/client';

export interface FiscalEmissionJobData {
  fiscalDocumentId: string;
  companyId: string;
  /**
   * Quem originou esta tentativa: o operador da venda, na emissão automática,
   * ou quem acionou a emissão manual/o retry. Fica no histórico de status.
   */
  usuarioId?: string;
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
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<FiscalEmissionJobData>): Promise<void> {
    const { fiscalDocumentId, companyId, usuarioId } = job.data;

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

    if (document.saleId) {
      await this.prisma.sale.update({
        where: { id: document.saleId },
        data: { fiscalStatus: FiscalStatus.PROCESSANDO },
      });
    }

    // Cada tentativa fica registrada com quem a originou e quando.
    await this.prisma.fiscalStatusHistory.create({
      data: {
        fiscalDocumentId,
        statusFrom: document.status,
        statusTo: FiscalDocumentStatus.PROCESSANDO,
        motivo: `Tentativa de emissão #${document.attempts + 1}`,
        usuarioId,
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
      await this.registerFailure(
        fiscalDocumentId,
        motivo,
        { etapa: 'preparacao', tentativa: document.attempts + 1 },
        document.saleId,
        usuarioId,
      );
      return;
    }

    try {
      const result = await this.engine.emitir(request);

      const newStatus = result.sucesso
        ? FiscalDocumentStatus.AUTORIZADO
        : FiscalDocumentStatus.REJEITADO;
      const dataAutorizacao = result.sucesso ? new Date() : undefined;

      // Arquivos vão para o storage antes da transação: upload não pode
      // segurar conexão de banco aberta.
      const arquivos = result.sucesso
        ? await this.persistirArquivos(
            companyId,
            result,
            result.chaveAcesso!,
            dataAutorizacao!,
          )
        : {};

      await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: fiscalDocumentId },
          data: {
            status: newStatus,
            protocolo: result.protocolo,
            chaveAcesso: result.chaveAcesso,
            rejeicaoCodigo: result.rejeicao?.codigo,
            rejeicaoMensagem: result.rejeicao?.mensagem,
            dataAutorizacao,
            qrCode: result.qrCode,
            ...arquivos,
          },
        });

        if (document.saleId) {
          await tx.sale.update({
            where: { id: document.saleId },
            data: {
              fiscalStatus: result.sucesso
                ? FiscalStatus.AUTORIZADO
                : FiscalStatus.REJEITADO,
            },
          });
        }

        await tx.fiscalStatusHistory.create({
          data: {
            fiscalDocumentId,
            statusFrom: FiscalDocumentStatus.PROCESSANDO,
            statusTo: newStatus,
            motivo: result.sucesso
              ? `Documento autorizado: protocolo ${result.protocolo}`
              : `Rejeição: ${result.rejeicao?.codigo} - ${result.rejeicao?.mensagem}`,
            usuarioId,
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
        undefined,
        document.saleId,
        usuarioId,
      );

      throw error; // BullMQ faz retry
    }
  }

  /**
   * Envia XML autorizado e DANFE para o storage e devolve as referências que
   * ficam no banco. Sem storage configurado o XML fica gravado na própria
   * coluna e o DANFE é descartado — o motor só o devolve na autorização.
   */
  private async persistirArquivos(
    companyId: string,
    result: EmitirNfceResult,
    chaveAcesso: string,
    dataAutorizacao: Date,
  ): Promise<{ xmlAutorizado?: string; danfeUrl?: string }> {
    const xml = result.xmlAutorizadoBase64
      ? Buffer.from(result.xmlAutorizadoBase64, 'base64').toString('utf-8')
      : undefined;

    if (!this.storage.isConfigured()) {
      if (result.danfeBase64) {
        this.logger.warn(
          `Storage não configurado: DANFE da chave ${chaveAcesso} não foi guardado`,
        );
      }
      return { xmlAutorizado: xml };
    }

    const arquivos: { xmlAutorizado?: string; danfeUrl?: string } = {};

    try {
      if (xml) {
        const chave = buildFiscalStorageKey(
          companyId,
          chaveAcesso,
          'xml',
          dataAutorizacao,
        );
        await this.storage.upload(chave, xml, 'application/xml');
        arquivos.xmlAutorizado = chave;
      }

      if (result.danfeBase64) {
        const chave = buildFiscalStorageKey(
          companyId,
          chaveAcesso,
          'pdf',
          dataAutorizacao,
        );
        await this.storage.upload(
          chave,
          Buffer.from(result.danfeBase64, 'base64'),
          'application/pdf',
        );
        arquivos.danfeUrl = chave;
      }
    } catch (error) {
      // Nota autorizada não pode virar erro por causa do storage.
      this.logger.error(
        `Falha ao guardar arquivos da chave ${chaveAcesso}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { xmlAutorizado: arquivos.xmlAutorizado ?? xml };
    }

    return arquivos;
  }

  /** Marca o documento como ERRO, com histórico e evento de auditoria. */
  private async registerFailure(
    fiscalDocumentId: string,
    motivo: string,
    detalhes?: Record<string, unknown>,
    saleId?: string | null,
    usuarioId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: fiscalDocumentId },
        data: { status: FiscalDocumentStatus.ERRO },
      });

      if (saleId) {
        await tx.sale.update({
          where: { id: saleId },
          data: { fiscalStatus: FiscalStatus.REJEITADO },
        });
      }

      await tx.fiscalStatusHistory.create({
        data: {
          fiscalDocumentId,
          statusFrom: FiscalDocumentStatus.PROCESSANDO,
          statusTo: FiscalDocumentStatus.ERRO,
          motivo,
          usuarioId,
        },
      });

      if (detalhes) {
        await tx.fiscalDocumentEvent.create({
          data: {
            fiscalDocumentId,
            tipo: 'emissao',
            detalhes: { sucesso: false, motivo, ...detalhes },
            usuarioId,
          },
        });
      }
    });
  }
}
