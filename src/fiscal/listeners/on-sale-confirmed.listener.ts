import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SALE_CONFIRMED_EVENT } from '../events/sale-confirmed.event';
import type { SaleConfirmedEvent } from '../events/sale-confirmed.event';
import { FISCAL_EMISSION_QUEUE } from '../../queue/queue.constants';
import { FiscalDocumentModel, FiscalDocumentStatus } from '@prisma/client';
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

    // Busca a venda para montar o snapshot
    const sale = await this.prisma.sale.findFirst({
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
    });

    if (!sale) {
      this.logger.warn(`Venda não encontrada: ${event.saleId}`);
      return;
    }

    // Monta o snapshot imutável
    const snapshot = {
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        totalAmount: Number(sale.totalAmount),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        saleDate: sale.saleDate,
      },
      establishment: {
        id: sale.establishment.id,
        name: sale.establishment.name,
        cnpj: sale.establishment.cnpj,
        inscricaoEstadual: sale.establishment.inscricaoEstadual,
        ibgeCode: sale.establishment.ibgeCode,
        address: {
          street: sale.establishment.street,
          number: sale.establishment.number,
          complement: sale.establishment.complement,
          neighborhood: sale.establishment.neighborhood,
          city: sale.establishment.city,
          state: sale.establishment.state,
          cep: sale.establishment.cep,
        },
      },
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            cpfCnpj: sale.customer.cpfCnpj,
          }
        : null,
      items: sale.items.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        ncm: item.product.ncm,
        cest: item.product.cest,
        cfop: item.product.cfop,
        unit: item.product.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        ncm_code: item.product.ncm,
        csosn: item.product.csosn,
        cstIcms: item.product.cstIcms,
      })),
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    };

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
