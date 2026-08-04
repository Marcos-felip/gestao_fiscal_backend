import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CashSessionStatus,
  FinancialStatus,
  FinancialType,
  PartnerType,
  PaymentCondition,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Sale,
  SaleStatus,
  StockMovementType,
  UnitOfMeasure,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, buildInstallments } from '../common/utils/installments';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { SalePaymentDto } from './dto/sale-payment.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SALE_CONFIRMED_EVENT } from '../fiscal/events/sale-confirmed.event';

interface SaleItemData {
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface SaleTotals {
  items: SaleItemData[];
  subtotal: number;
  discount: number;
  totalAmount: number;
}

interface SalePaymentData {
  method: PaymentMethod;
  amount: number;
  amountReceived: number | null;
  changeGiven: number | null;
}

/** Diferença aceita entre a soma dos pagamentos e o total da venda */
const PAYMENT_TOLERANCE = 0.01;

export interface SaleContext {
  establishments: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  products: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    unit: UnitOfMeasure;
    salePrice: Prisma.Decimal | null;
    currentStock: Prisma.Decimal;
  }[];
}

/** Evita centavos fantasmas na soma dos itens antes de gravar em Decimal(12,2) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const SALE_DETAIL_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, unit: true } },
    },
  },
  payments: true,
  establishment: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
};

/** Toda venda devolvida pela API sai com itens e pagamentos */
const SALE_INCLUDE = { items: true, payments: true };

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    companyId: string,
    dto: CreateSaleDto,
    operatorId: string,
  ): Promise<Sale> {
    const sale = await this.prisma.$transaction(async (tx) => {
      // Sem filtrar deletedAt de propósito: o índice único (company_id,
      // sale_number) também cobre as vendas excluídas, então ignorá-las aqui
      // faria a numeração reutilizar o número de uma venda soft-deletada e
      // estourar P2002 na próxima venda
      const aggregate = await tx.sale.aggregate({
        where: { companyId },
        _max: { saleNumber: true },
      });
      const saleNumber = (aggregate._max.saleNumber ?? 0) + 1;

      const establishment = await tx.establishment.findFirst({
        where: { id: dto.establishmentId, companyId, deletedAt: null },
      });
      if (!establishment) {
        throw new NotFoundException('Estabelecimento não encontrado');
      }

      if (dto.customerId) {
        await this.assertCustomerExists(tx, dto.customerId, companyId);
      }

      const totals = await this.calculateTotals(
        tx,
        companyId,
        dto.items,
        dto.discount,
      );

      const sale = await tx.sale.create({
        data: {
          companyId,
          establishmentId: dto.establishmentId,
          customerId: dto.customerId,
          saleNumber,
          subtotal: totals.subtotal,
          discount: totals.discount,
          totalAmount: totals.totalAmount,
          paymentMethod: dto.paymentMethod,
          paymentCondition: dto.paymentCondition,
          installments: dto.installments,
          // Guardados na venda porque o orçamento pode ser finalizado dias
          // depois, por outra rota, e o plano de parcelas tem que sobreviver
          firstDueDate: dto.firstDueDate ? new Date(dto.firstDueDate) : null,
          intervalDays: dto.intervalDays,
          notes: dto.notes,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          items: { create: totals.items },
        },
        include: SALE_INCLUDE,
      });

      // PDV finaliza em uma chamada só: cria e já dá baixa no estoque
      if (!dto.confirm) {
        return sale;
      }

      return this.finalize(tx, companyId, sale, operatorId, dto.payments);
    });

    // Emite o evento de venda confirmada para o módulo fiscal
    // (depois da transação commitar para evitar eventos de vendas que podem ser revertidas)
    if (sale.status === SaleStatus.CONCLUIDA) {
      this.eventEmitter.emit(SALE_CONFIRMED_EVENT, {
        saleId: sale.id,
        companyId: sale.companyId,
        establishmentId: sale.establishmentId,
        usuarioId: operatorId,
      });
    }

    return sale;
  }

  async findAll(
    companyId: string,
    filter: FilterSaleDto,
  ): Promise<{
    data: Sale[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (filter.status) where['status'] = filter.status;
    if (filter.paymentStatus) where['paymentStatus'] = filter.paymentStatus;
    if (filter.fiscalStatus) where['fiscalStatus'] = filter.fiscalStatus;
    if (filter.customerId) where['customerId'] = filter.customerId;
    if (filter.establishmentId) {
      where['establishmentId'] = filter.establishmentId;
    }

    if (filter.startDate || filter.endDate) {
      const saleDate: Record<string, Date> = {};
      if (filter.startDate) saleDate['gte'] = new Date(filter.startDate);
      if (filter.endDate) saleDate['lte'] = new Date(filter.endDate);
      where['saleDate'] = saleDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Catálogo mínimo para montar uma venda no balcão.
   *
   * Vive aqui e não nos módulos de origem para que o vendedor precise apenas de
   * `sales.*`: Estabelecimentos, Parceiros e Produtos continuam gated em `.list`.
   */
  async getContext(companyId: string): Promise<SaleContext> {
    const [establishments, customers, products] = await Promise.all([
      this.prisma.establishment.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      // Fornecedor puro não compra: só CLIENT e BOTH entram na lista
      this.prisma.partner.findMany({
        where: {
          companyId,
          deletedAt: null,
          type: { not: PartnerType.SUPPLIER },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          unit: true,
          salePrice: true,
          currentStock: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { establishments, customers, products };
  }

  async findOne(id: string, companyId: string): Promise<Sale> {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId, deletedAt: null },
      include: SALE_DETAIL_INCLUDE,
    });

    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateSaleDto,
  ): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId, deletedAt: null },
        include: SALE_INCLUDE,
      });

      if (!sale) throw new NotFoundException('Venda não encontrada');

      if (!this.isEditable(sale.status)) {
        throw new BadRequestException(
          'Apenas vendas em ORCAMENTO ou EM_ABERTO podem ser editadas',
        );
      }

      if (dto.customerId) {
        await this.assertCustomerExists(tx, dto.customerId, companyId);
      }

      const data: Prisma.SaleUpdateInput = {
        notes: dto.notes,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : undefined,
      };

      if (dto.customerId) {
        data.customer = { connect: { id: dto.customerId } };
      }

      // Itens e desconto mexem no total, então recalculam a venda inteira
      if (dto.items || dto.discount !== undefined) {
        const items =
          dto.items ??
          sale.items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          }));

        const totals = await this.calculateTotals(
          tx,
          companyId,
          items,
          dto.discount ?? Number(sale.discount),
        );

        data.subtotal = totals.subtotal;
        data.discount = totals.discount;
        data.totalAmount = totals.totalAmount;

        if (dto.items) {
          await tx.saleItem.deleteMany({ where: { saleId: id } });
          data.items = { create: totals.items };
        }
      }

      return tx.sale.update({
        where: { id },
        data,
        include: SALE_INCLUDE,
      });
    });
  }

  async confirm(
    id: string,
    companyId: string,
    operatorId: string,
    dto: ConfirmSaleDto = {},
  ): Promise<Sale> {
    const sale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId, deletedAt: null },
      });

      if (!sale) throw new NotFoundException('Venda não encontrada');

      if (sale.status === SaleStatus.CONCLUIDA) {
        throw new BadRequestException('Venda já finalizada');
      }

      if (sale.status === SaleStatus.CANCELADA) {
        throw new BadRequestException(
          'Não é possível finalizar uma venda cancelada',
        );
      }

      return this.finalize(tx, companyId, sale, operatorId, dto.payments);
    });

    // Emite o evento de venda confirmada para o módulo fiscal
    if (sale.status === SaleStatus.CONCLUIDA) {
      this.eventEmitter.emit(SALE_CONFIRMED_EVENT, {
        saleId: sale.id,
        companyId: sale.companyId,
        establishmentId: sale.establishmentId,
        usuarioId: operatorId,
      });
    }

    return sale;
  }

  /**
   * Fecha a venda: baixa de estoque, status CONCLUIDA e o desdobramento
   * financeiro. Compartilhado entre `POST /sales/:id/confirm` e o
   * `POST /sales { confirm: true }` do PDV.
   */
  private async finalize(
    tx: Prisma.TransactionClient,
    companyId: string,
    sale: Sale,
    operatorId: string,
    payments?: SalePaymentDto[],
  ): Promise<Sale> {
    const isCash = sale.paymentCondition === PaymentCondition.A_VISTA;

    // Valida antes de mexer no estoque: pagamento que não fecha o total derruba
    // a venda inteira, e não faz sentido gastar as leituras de produto até lá
    const settlement = isCash
      ? this.buildPayments(Number(sale.totalAmount), payments)
      : null;

    const cashSession = await tx.cashSession.findFirst({
      where: { companyId, operatorId, status: CashSessionStatus.ABERTA },
      select: { id: true },
    });

    // Dinheiro à vista tem que cair em alguma gaveta, e a gaveta é a sessão. A
    // venda a prazo não passa pelo caixa, mas é carimbada quando existe sessão
    // aberta para o fechamento conseguir mostrar quanto do turno saiu fiado.
    if (isCash && !cashSession) {
      throw new BadRequestException(
        'Abra um caixa para registrar vendas em dinheiro',
      );
    }

    await this.applyStockExit(tx, companyId, sale.id, sale.saleNumber);

    if (settlement) {
      await tx.salePayment.createMany({
        data: settlement.rows.map((row) => ({
          companyId,
          saleId: sale.id,
          ...row,
        })),
      });
    } else {
      // À vista é quitada no balcão: nada a receber depois. Contas a receber
      // guarda só o que fica em aberto.
      await this.createReceivables(tx, companyId, sale);
    }

    // fiscalStatus é eixo independente e continua com o módulo fiscal
    return tx.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.CONCLUIDA,
        paymentStatus: isCash ? PaymentStatus.APROVADO : PaymentStatus.PENDENTE,
        ...(cashSession ? { cashSessionId: cashSession.id } : {}),
        // Coluna mantida só para exibição e relatório; a verdade está em payments
        ...(settlement ? { paymentMethod: settlement.predominant } : {}),
      },
      include: SALE_INCLUDE,
    });
  }

  /**
   * Valida as formas de pagamento de uma venda à vista.
   *
   * A soma tem que fechar o total com folga de um centavo — o arredondamento de
   * um rateio no caixa não pode travar a venda, mas uma diferença maior é erro
   * de digitação e vira 400.
   */
  private buildPayments(
    totalAmount: number,
    payments?: SalePaymentDto[],
  ): { rows: SalePaymentData[]; predominant: PaymentMethod } {
    if (!payments || payments.length === 0) {
      throw new BadRequestException(
        'Informe as formas de pagamento para finalizar uma venda à vista',
      );
    }

    const rows = payments.map((payment) => {
      const amount = round2(payment.amount);
      const isCashMethod = payment.method === PaymentMethod.DINHEIRO;

      // Troco só existe em dinheiro: em cartão ou PIX o valor entregue é
      // exatamente o cobrado, e um amountReceived aqui seria ruído
      if (!isCashMethod || payment.amountReceived === undefined) {
        return {
          method: payment.method,
          amount,
          amountReceived: null,
          changeGiven: null,
        };
      }

      const amountReceived = round2(payment.amountReceived);

      if (amountReceived < amount) {
        throw new BadRequestException(
          'O valor recebido em dinheiro não pode ser menor que o valor do pagamento',
        );
      }

      return {
        method: payment.method,
        amount,
        amountReceived,
        changeGiven: round2(amountReceived - amount),
      };
    });

    const paid = round2(rows.reduce((sum, row) => sum + row.amount, 0));

    // A diferença é arredondada antes de comparar: 100 - 99.99 dá
    // 0.010000000000005 em ponto flutuante e escaparia da tolerância
    if (round2(Math.abs(paid - round2(totalAmount))) > PAYMENT_TOLERANCE) {
      throw new BadRequestException(
        'Os pagamentos devem somar o total da venda',
      );
    }

    const predominant = rows.reduce((biggest, row) =>
      row.amount > biggest.amount ? row : biggest,
    ).method;

    return { rows, predominant };
  }

  private async createReceivables(
    tx: Prisma.TransactionClient,
    companyId: string,
    sale: Sale,
  ): Promise<void> {
    const firstDueDate =
      sale.firstDueDate ?? addDays(new Date(), sale.intervalDays);

    const installments = buildInstallments(
      Number(sale.totalAmount),
      sale.installments,
      firstDueDate,
      sale.intervalDays,
    );

    await tx.financialEntry.createMany({
      data: installments.map((installment) => ({
        companyId,
        establishmentId: sale.establishmentId,
        type: FinancialType.RECEBER,
        status: FinancialStatus.ABERTO,
        partnerId: sale.customerId,
        saleId: sale.id,
        description: `Venda #${sale.saleNumber} (${installment.installmentNumber}/${installment.installmentTotal})`,
        amount: installment.amount,
        dueDate: installment.dueDate,
        installmentNumber: installment.installmentNumber,
        installmentTotal: installment.installmentTotal,
        paymentMethod: sale.paymentMethod,
      })),
    });
  }

  async cancel(id: string, companyId: string): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId, deletedAt: null },
        include: SALE_INCLUDE,
      });

      if (!sale) throw new NotFoundException('Venda não encontrada');

      if (sale.status === SaleStatus.CANCELADA) {
        throw new BadRequestException('Venda já cancelada');
      }

      // Só devolve ao estoque o que saiu de fato — orçamento nunca deu baixa
      if (sale.status === SaleStatus.CONCLUIDA) {
        await this.cancelReceivables(tx, companyId, sale.id);

        for (const item of sale.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, companyId, deletedAt: null },
          });

          if (!product) continue;

          const quantity = Number(item.quantity);

          await tx.stockMovement.create({
            data: {
              companyId,
              productId: item.productId,
              type: StockMovementType.ENTRADA,
              quantity,
              referenceId: sale.id,
              reason: `Cancelamento da Venda #${sale.saleNumber}`,
            },
          });

          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: Number(product.currentStock) + quantity },
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELADA,
          ...(sale.paymentStatus === PaymentStatus.APROVADO
            ? { paymentStatus: PaymentStatus.ESTORNADO }
            : {}),
        },
        include: SALE_INCLUDE,
      });
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const sale = await this.findOne(id, companyId);

    if (
      sale.status !== SaleStatus.ORCAMENTO &&
      sale.status !== SaleStatus.CANCELADA
    ) {
      throw new BadRequestException(
        'Apenas vendas em ORCAMENTO ou CANCELADAS podem ser excluídas',
      );
    }

    await this.prisma.sale.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Cancela os títulos gerados pela venda.
   *
   * Se alguma parcela já foi recebida, **bloqueia** em vez de estornar sozinho:
   * apagar um recebimento silenciosamente perderia histórico de caixa. O estorno
   * do financeiro é passo manual e consciente.
   */
  private async cancelReceivables(
    tx: Prisma.TransactionClient,
    companyId: string,
    saleId: string,
  ): Promise<void> {
    const paid = await tx.financialEntry.findFirst({
      where: {
        saleId,
        companyId,
        deletedAt: null,
        status: { not: FinancialStatus.CANCELADO },
        payments: { some: {} },
      },
      select: { id: true },
    });

    if (paid) {
      throw new BadRequestException(
        'Venda possui parcelas recebidas; estorne o financeiro antes',
      );
    }

    await tx.financialEntry.updateMany({
      where: {
        saleId,
        companyId,
        deletedAt: null,
        status: { not: FinancialStatus.CANCELADO },
      },
      data: { status: FinancialStatus.CANCELADO },
    });
  }

  private isEditable(status: SaleStatus): boolean {
    return status === SaleStatus.ORCAMENTO || status === SaleStatus.EM_ABERTO;
  }

  private async assertCustomerExists(
    tx: Prisma.TransactionClient,
    customerId: string,
    companyId: string,
  ): Promise<void> {
    const customer = await tx.partner.findFirst({
      where: { id: customerId, companyId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }
  }

  private async calculateTotals(
    tx: Prisma.TransactionClient,
    companyId: string,
    items: CreateSaleItemDto[],
    discount?: number,
  ): Promise<SaleTotals> {
    const itemsData: SaleItemData[] = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId, deletedAt: null },
      });

      if (!product) {
        throw new NotFoundException(
          `Produto não encontrado: ${item.productId}`,
        );
      }

      const total = round2(item.quantity * item.unitPrice);
      subtotal = round2(subtotal + total);

      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total,
      });
    }

    const appliedDiscount = round2(discount ?? 0);

    if (appliedDiscount > subtotal) {
      throw new BadRequestException(
        'O desconto não pode ser maior que o subtotal da venda',
      );
    }

    return {
      items: itemsData,
      subtotal,
      discount: appliedDiscount,
      totalAmount: round2(subtotal - appliedDiscount),
    };
  }

  /**
   * Baixa de estoque da finalização.
   *
   * A validação roda aqui e não na criação de propósito: um orçamento pode
   * ficar dias parado e o estoque muda nesse meio-tempo. O saldo é acumulado
   * em memória para que dois itens do mesmo produto na mesma venda não passem
   * pela validação lendo o estoque original duas vezes.
   */
  private async applyStockExit(
    tx: Prisma.TransactionClient,
    companyId: string,
    saleId: string,
    saleNumber: number,
  ): Promise<void> {
    const items = await tx.saleItem.findMany({ where: { saleId } });

    const balances = new Map<string, { name: string; stock: number }>();

    for (const item of items) {
      let balance = balances.get(item.productId);

      if (!balance) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, companyId, deletedAt: null },
        });

        if (!product) {
          throw new NotFoundException(
            `Produto não encontrado: ${item.productId}`,
          );
        }

        balance = { name: product.name, stock: Number(product.currentStock) };
        balances.set(item.productId, balance);
      }

      const quantity = Number(item.quantity);

      if (balance.stock < quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto ${balance.name}`,
        );
      }

      balance.stock -= quantity;

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: item.productId,
          type: StockMovementType.SAIDA,
          quantity,
          referenceId: saleId,
          reason: `Venda #${saleNumber}`,
        },
      });
    }

    for (const [productId, balance] of balances) {
      await tx.product.update({
        where: { id: productId },
        data: { currentStock: balance.stock },
      });
    }
  }
}
