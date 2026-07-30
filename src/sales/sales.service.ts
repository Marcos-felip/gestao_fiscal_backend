import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  Sale,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

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
  establishment: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateSaleDto): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.sale.aggregate({
        where: { companyId, deletedAt: null },
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
          notes: dto.notes,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          items: { create: totals.items },
        },
        include: { items: true },
      });

      // PDV finaliza em uma chamada só: cria e já dá baixa no estoque
      if (!dto.confirm) {
        return sale;
      }

      await this.applyStockExit(tx, companyId, sale.id, sale.saleNumber);

      return tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CONCLUIDA },
        include: { items: true },
      });
    });
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
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, total, page, limit };
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
        include: { items: true },
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
        include: { items: true },
      });
    });
  }

  async confirm(id: string, companyId: string): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
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

      await this.applyStockExit(tx, companyId, sale.id, sale.saleNumber);

      // paymentStatus e fiscalStatus são eixos independentes: quem os move são
      // os módulos financeiro e fiscal, não a finalização da venda
      return tx.sale.update({
        where: { id },
        data: { status: SaleStatus.CONCLUIDA },
        include: { items: true },
      });
    });
  }

  async cancel(id: string, companyId: string): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId, deletedAt: null },
        include: { items: true },
      });

      if (!sale) throw new NotFoundException('Venda não encontrada');

      if (sale.status === SaleStatus.CANCELADA) {
        throw new BadRequestException('Venda já cancelada');
      }

      // Só devolve ao estoque o que saiu de fato — orçamento nunca deu baixa
      if (sale.status === SaleStatus.CONCLUIDA) {
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
        include: { items: true },
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
