import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SALE_CONFIRMED_EVENT } from '../events/sale-confirmed.event';
import type { SaleConfirmedEvent } from '../events/sale-confirmed.event';
import { FISCAL_EMISSION_QUEUE } from '../../queue/queue.constants';
import {
  buildFiscalSnapshot,
  FiscalSnapshot,
} from '../emission/fiscal-snapshot.builder';
import { checkEmissionSettings } from '../emission/fiscal-preconditions';
import {
  FiscalDocumentModel,
  FiscalDocumentStatus,
  PersonType,
} from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * Escuta o evento `sale.confirmed` disparado pelo SalesService ao finalizar
 * uma venda e cria o FiscalDocument correspondente, enfileirando a emissão.
 *
 * Se o estabelecimento não tiver FiscalSettings ativo, o documento não é
 * criado — a emissão é opt-in por estabelecimento.
 */
@Injectable()
export class OnSaleConfirmedListener {
  private readonly logger = new Logger(OnSaleConfirmedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(FISCAL_EMISSION_QUEUE)
    private readonly fiscalQueue: Queue,
  ) {}

  @OnEvent(SALE_CONFIRMED_EVENT)
  async handleSaleConfirmed(event: SaleConfirmedEvent): Promise<void> {
    this.logger.log(
      `Venda confirmada recebida: saleId=${event.saleId}, companyId=${event.companyId}`,
    );

    // Busca as configurações fiscais do estabelecimento
    const fiscalSettings = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId: event.establishmentId,
        companyId: event.companyId,
        ativo: true,
        deletedAt: null,
      },
    });

    if (!fiscalSettings) {
      this.logger.log(
        `Estabelecimento ${event.establishmentId} sem configuração fiscal ativa, pulando emissão automática`,
      );
      return;
    }

    // Certificado e CSC conferidos antes de reservar numeração.
    const pendencias = checkEmissionSettings(fiscalSettings);

    if (pendencias.length > 0) {
      this.logger.warn(
        `Emissão automática cancelada para a venda ${event.saleId}: ${pendencias.join('; ')}`,
      );
      return;
    }

    // Busca a venda e a empresa para montar o snapshot
    const [sale, company] = await Promise.all([
      this.prisma.sale.findFirst({
        where: {
          id: event.saleId,
          companyId: event.companyId,
          deletedAt: null,
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          payments: true,
          customer: true,
          establishment: true,
        },
      }),
      this.prisma.company.findFirst({
        where: { id: event.companyId, deletedAt: null },
      }),
    ]);

    if (!sale || !company) {
      this.logger.warn(`Venda não encontrada: ${event.saleId}`);
      return;
    }

    // Venda a pessoa jurídica sai como NF-e, não como NFC-e — é o recorte
    // definido na etapa 3: PF → NFC-e, PJ → NF-e, sem critério a inventar.
    //
    // A emissão da NF-e **não** é automática porque ela exige uma resposta que
    // ninguém pode presumir: se a mercadoria vai para revenda ou para consumo
    // (`indFinal`). O mesmo produto, para o mesmo cliente, muda conforme o
    // destino. A venda fica em NAO_EMITIDO e a tela oferece "Emitir NF-e".
    //
    // Sem isto, o documento de NFC-e ocupa o `sale_id` — que é único — e a NF-e
    // daquela venda se torna impossível de emitir.
    if (sale.customer?.personType === PersonType.PJ) {
      this.logger.log(
        `Venda ${event.saleId} é para pessoa jurídica: emissão automática de ` +
          'NFC-e pulada, aguardando emissão de NF-e',
      );
      return;
    }

    // Monta o snapshot imutável. Pré-condição fiscal inválida derruba a
    // emissão automática aqui, antes de reservar numeração.
    let snapshot: FiscalSnapshot;
    try {
      snapshot = buildFiscalSnapshot(company, sale);
    } catch (error) {
      this.logger.warn(
        `Emissão automática cancelada para a venda ${event.saleId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    // Reserva o próximo número de NFC-e atomicamente
    await this.prisma.fiscalSettings.update({
      where: { id: fiscalSettings.id },
      data: { proximoNumeroNfce: { increment: 1 } },
    });

    const numeroNfce = fiscalSettings.proximoNumeroNfce;
    const idempotencyKey = `nfce-${event.companyId}-${event.saleId}-${randomUUID()}`;

    // Cria o documento fiscal
    const fiscalDocument = await this.prisma.fiscalDocument.create({
      data: {
        companyId: event.companyId,
        establishmentId: event.establishmentId,
        saleId: event.saleId,
        modelo: FiscalDocumentModel.NFCE,
        serie: fiscalSettings.serieNfce,
        numero: numeroNfce,
        ambiente: fiscalSettings.ambiente,
        status: FiscalDocumentStatus.PENDENTE,
        idempotencyKey,
        engine: 'dfe-net',
        snapshot: snapshot as unknown as object,
        valorTotal: sale.totalAmount,
        dataEmissao: new Date(),
      },
    });

    // Adiciona histórico inicial
    await this.prisma.fiscalStatusHistory.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        statusFrom: FiscalDocumentStatus.NAO_EMITIDO,
        statusTo: FiscalDocumentStatus.PENDENTE,
        motivo: 'Documento criado pela finalização da venda',
      },
    });

    // Registra evento de criação
    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        tipo: 'emissao',
        detalhes: {
          action: 'queued',
          saleId: event.saleId,
          saleNumber: sale.saleNumber,
        },
      },
    });

    // Enfileira a emissão
    await this.fiscalQueue.add(
      'emitir',
      {
        fiscalDocumentId: fiscalDocument.id,
        companyId: event.companyId,
        usuarioId: event.usuarioId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `fiscal-${fiscalDocument.id}`,
      },
    );

    this.logger.log(
      `Documento fiscal ${fiscalDocument.id} criado e enfileirado para emissão (NFC-e #${numeroNfce})`,
    );
  }
}
