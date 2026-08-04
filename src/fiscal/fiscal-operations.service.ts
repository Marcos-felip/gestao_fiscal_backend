import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FiscalDocumentStatus, FiscalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';
import {
  FiscalEngineHealth,
  StatusServicoResult,
} from './fiscal-engine/fiscal-engine.interface';
import { mapAmbiente } from './emission/fiscal-rules';
import { buildFiscalStorageKey } from './emission/fiscal-storage';
import { FISCAL_EMISSION_QUEUE } from '../queue/queue.constants';

/** Situação do documento depois de reconciliada com a SEFAZ. */
export interface ConsultaResult {
  situacao?: string;
  protocolo?: string;
  status: FiscalDocumentStatus;
  atualizado: boolean;
  mensagem?: string;
}

/**
 * Ações sobre um documento fiscal já criado: cancelar, consultar na SEFAZ,
 * reprocessar a emissão e testar a comunicação com o ambiente autorizador.
 */
@Injectable()
export class FiscalOperationsService {
  private readonly logger = new Logger(FiscalOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: DfeNetFiscalEngine,
    private readonly certificates: FiscalCertificateService,
    private readonly storage: StorageService,
    @InjectQueue(FISCAL_EMISSION_QUEUE)
    private readonly fiscalQueue: Queue,
  ) {}

  // ──────────────────────────────────────────────
  // Cancelamento
  // ──────────────────────────────────────────────

  /**
   * Cancela um documento autorizado junto à SEFAZ.
   *
   * Só nota autorizada pode ser cancelada, e uma única vez: o documento já
   * cancelado é recusado antes de chegar ao motor.
   */
  async cancel(
    companyId: string,
    fiscalDocumentId: string,
    justificativa: string,
    userId?: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null>> {
    const document = await this.requireDocument(companyId, fiscalDocumentId);

    if (document.status === FiscalDocumentStatus.CANCELADO) {
      throw new BadRequestException('Documento fiscal já está cancelado');
    }

    if (document.status !== FiscalDocumentStatus.AUTORIZADO) {
      throw new BadRequestException(
        'Somente documento autorizado pode ser cancelado',
      );
    }

    if (!document.chaveAcesso || !document.protocolo) {
      throw new BadRequestException(
        'Documento sem chave de acesso ou protocolo de autorização',
      );
    }

    const credentials = await this.certificates.loadCredentials(
      companyId,
      document.establishmentId,
    );

    const result = await this.engine.cancelar({
      chaveAcesso: document.chaveAcesso,
      protocoloAutorizacao: document.protocolo,
      justificativa,
      ambiente: mapAmbiente(document.ambiente),
      ...credentials,
    });

    if (!result.sucesso) {
      await this.prisma.fiscalDocumentEvent.create({
        data: {
          fiscalDocumentId,
          tipo: 'cancelamento',
          detalhes: { sucesso: false, motivo: result.motivoRejeicao },
          usuarioId: userId,
        },
      });

      throw new BadRequestException(
        `Cancelamento recusado pela SEFAZ: ${result.motivoRejeicao ?? 'motivo não informado'}`,
      );
    }

    const dataCancelamento = new Date();
    const xmlCancelamento = await this.persistirXmlCancelamento(
      companyId,
      document.chaveAcesso,
      result.xmlCancelamentoBase64,
      dataCancelamento,
    );

    const [atualizado] = await this.prisma.$transaction([
      this.prisma.fiscalDocument.update({
        where: { id: fiscalDocumentId },
        data: {
          status: FiscalDocumentStatus.CANCELADO,
          dataCancelamento,
          xmlCancelamento,
        },
      }),
      this.prisma.fiscalStatusHistory.create({
        data: {
          fiscalDocumentId,
          statusFrom: document.status,
          statusTo: FiscalDocumentStatus.CANCELADO,
          motivo: `Cancelamento homologado: ${justificativa}`,
          usuarioId: userId,
        },
      }),
      this.prisma.fiscalDocumentEvent.create({
        data: {
          fiscalDocumentId,
          tipo: 'cancelamento',
          detalhes: {
            sucesso: true,
            protocolo: result.protocolo,
            justificativa,
          },
          usuarioId: userId,
        },
      }),
      ...(document.saleId
        ? [
            this.prisma.sale.update({
              where: { id: document.saleId },
              data: { fiscalStatus: FiscalStatus.CANCELADO },
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Documento cancelado: ${fiscalDocumentId}, chave=${document.chaveAcesso}, protocolo=${result.protocolo}`,
    );

    return atualizado;
  }

  // ──────────────────────────────────────────────
  // Consulta
  // ──────────────────────────────────────────────

  /**
   * Consulta a situação da nota na SEFAZ e reconcilia o status local.
   *
   * Serve para o caso clássico de timeout: o motor não respondeu, mas a nota
   * foi autorizada do outro lado.
   */
  async consultar(
    companyId: string,
    fiscalDocumentId: string,
    userId?: string,
  ): Promise<ConsultaResult> {
    const document = await this.requireDocument(companyId, fiscalDocumentId);

    if (!document.chaveAcesso) {
      throw new BadRequestException(
        'Documento sem chave de acesso — não há o que consultar na SEFAZ',
      );
    }

    const credentials = await this.certificates.loadCredentials(
      companyId,
      document.establishmentId,
    );

    const result = await this.engine.consultar({
      chaveAcesso: document.chaveAcesso,
      ambiente: mapAmbiente(document.ambiente),
      ...credentials,
    });

    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId,
        tipo: 'consulta',
        detalhes: {
          sucesso: result.sucesso,
          situacao: result.status,
          protocolo: result.protocolo,
        },
        usuarioId: userId,
      },
    });

    if (!result.sucesso) {
      return {
        status: document.status,
        atualizado: false,
        mensagem: result.mensagemErro,
      };
    }

    const situacao = interpretarSituacao(result.status);

    if (!situacao || situacao === document.status) {
      return {
        situacao: result.status,
        protocolo: result.protocolo,
        status: document.status,
        atualizado: false,
      };
    }

    await this.prisma.$transaction([
      this.prisma.fiscalDocument.update({
        where: { id: fiscalDocumentId },
        data: {
          status: situacao,
          protocolo: result.protocolo ?? document.protocolo,
          dataAutorizacao:
            situacao === FiscalDocumentStatus.AUTORIZADO
              ? (document.dataAutorizacao ?? new Date())
              : document.dataAutorizacao,
        },
      }),
      this.prisma.fiscalStatusHistory.create({
        data: {
          fiscalDocumentId,
          statusFrom: document.status,
          statusTo: situacao,
          motivo: `Reconciliado pela consulta à SEFAZ: ${result.status ?? 'sem descrição'}`,
          usuarioId: userId,
        },
      }),
      ...(document.saleId
        ? [
            this.prisma.sale.update({
              where: { id: document.saleId },
              data: { fiscalStatus: mapSaleStatus(situacao) },
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Documento ${fiscalDocumentId} reconciliado: ${document.status} -> ${situacao}`,
    );

    return {
      situacao: result.status,
      protocolo: result.protocolo,
      status: situacao,
      atualizado: true,
    };
  }

  // ──────────────────────────────────────────────
  // Reprocessamento
  // ──────────────────────────────────────────────

  /**
   * Reenfileira a emissão do mesmo documento, mantendo série e número.
   *
   * Só documento que falhou entra na fila de novo; nota autorizada nunca é
   * reprocessada para não duplicar.
   */
  async retry(
    companyId: string,
    fiscalDocumentId: string,
    userId?: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null>> {
    const document = await this.requireDocument(companyId, fiscalDocumentId);

    const reprocessavel: FiscalDocumentStatus[] = [
      FiscalDocumentStatus.ERRO,
      FiscalDocumentStatus.REJEITADO,
      FiscalDocumentStatus.PENDENTE,
    ];

    if (!reprocessavel.includes(document.status)) {
      throw new BadRequestException(
        `Documento com status ${document.status} não pode ser reprocessado`,
      );
    }

    const [atualizado] = await this.prisma.$transaction([
      this.prisma.fiscalDocument.update({
        where: { id: fiscalDocumentId },
        data: {
          status: FiscalDocumentStatus.PENDENTE,
          rejeicaoCodigo: null,
          rejeicaoMensagem: null,
        },
      }),
      this.prisma.fiscalStatusHistory.create({
        data: {
          fiscalDocumentId,
          statusFrom: document.status,
          statusTo: FiscalDocumentStatus.PENDENTE,
          motivo: 'Reprocessamento solicitado',
          usuarioId: userId,
        },
      }),
      this.prisma.fiscalDocumentEvent.create({
        data: {
          fiscalDocumentId,
          tipo: 'retry',
          detalhes: {
            statusAnterior: document.status,
            tentativas: document.attempts,
          },
          usuarioId: userId,
        },
      }),
    ]);

    // O job anterior precisa sair da fila para o mesmo jobId ser aceito:
    // é ele que garante um job por documento.
    const jobId = `fiscal-${fiscalDocumentId}`;
    await this.fiscalQueue.remove(jobId).catch(() => undefined);
    await this.fiscalQueue.add(
      'emitir',
      { fiscalDocumentId, companyId, usuarioId: userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId,
      },
    );

    this.logger.log(`Documento ${fiscalDocumentId} reenfileirado para emissão`);

    return atualizado;
  }

  // ──────────────────────────────────────────────
  // Status do serviço da SEFAZ
  // ──────────────────────────────────────────────

  /** Testa a comunicação com a SEFAZ usando o certificado do estabelecimento. */
  async statusServico(
    companyId: string,
    establishmentId: string,
  ): Promise<StatusServicoResult> {
    const settings = await this.prisma.fiscalSettings.findFirst({
      where: { establishmentId, companyId, deletedAt: null },
      include: { establishment: { select: { state: true } } },
    });

    if (!settings) {
      throw new NotFoundException(
        'Configuração fiscal não encontrada para este estabelecimento',
      );
    }

    const uf = settings.establishment.state?.trim().toUpperCase();

    if (!uf || uf.length !== 2) {
      throw new BadRequestException(
        'Informe a UF do estabelecimento para testar a comunicação com a SEFAZ',
      );
    }

    const credentials = await this.certificates.loadCredentials(
      companyId,
      establishmentId,
    );

    return this.engine.statusServico({
      ambiente: mapAmbiente(settings.ambiente),
      uf,
      ...credentials,
    });
  }

  /**
   * Sonda de saúde do motor fiscal, para monitoramento.
   *
   * Não exige certificado nem estabelecimento e não consulta a SEFAZ — só
   * responde se o microserviço .NET está no ar.
   */
  engineHealth(): Promise<FiscalEngineHealth> {
    return this.engine.health();
  }

  // ──────────────────────────────────────────────
  // Apoio
  // ──────────────────────────────────────────────

  private async requireDocument(companyId: string, fiscalDocumentId: string) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    return document;
  }

  /** Guarda o XML do cancelamento no storage; sem storage, fica na coluna. */
  private async persistirXmlCancelamento(
    companyId: string,
    chaveAcesso: string,
    xmlBase64: string | undefined,
    referencia: Date,
  ): Promise<string | undefined> {
    if (!xmlBase64) return undefined;

    const xml = Buffer.from(xmlBase64, 'base64').toString('utf-8');

    if (!this.storage.isConfigured()) return xml;

    const chave = buildFiscalStorageKey(
      companyId,
      chaveAcesso,
      'xml',
      referencia,
      'cancelamento',
    );

    try {
      await this.storage.upload(chave, xml, 'application/xml');
      return chave;
    } catch (error) {
      this.logger.error(
        `Falha ao guardar o XML de cancelamento (${chave}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return xml;
    }
  }
}

/** Traduz a descrição devolvida pela SEFAZ em status do documento. */
function interpretarSituacao(
  situacao?: string,
): FiscalDocumentStatus | undefined {
  if (!situacao) return undefined;

  if (/cancel/i.test(situacao)) return FiscalDocumentStatus.CANCELADO;
  if (/denegad/i.test(situacao)) return FiscalDocumentStatus.REJEITADO;
  if (/autorizad/i.test(situacao)) return FiscalDocumentStatus.AUTORIZADO;

  return undefined;
}

function mapSaleStatus(status: FiscalDocumentStatus): FiscalStatus {
  switch (status) {
    case FiscalDocumentStatus.AUTORIZADO:
      return FiscalStatus.AUTORIZADO;
    case FiscalDocumentStatus.CANCELADO:
      return FiscalStatus.CANCELADO;
    default:
      return FiscalStatus.REJEITADO;
  }
}
