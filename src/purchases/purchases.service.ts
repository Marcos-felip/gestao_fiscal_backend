import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialStatus,
  FinancialType,
  PaymentCondition,
  Prisma,
  Purchase,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_INTERVAL_DAYS,
  addDays,
  buildInstallments,
} from '../common/utils/installments';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { FilterPurchaseDto } from './dto/filter-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreatePurchaseDto): Promise<Purchase> {
    return this.prisma.$transaction(async (tx) => {
      // Sem filtrar deletedAt: o índice único (company_id, purchase_number)
      // também cobre as compras excluídas — ver a mesma nota em SalesService
      const aggregate = await tx.purchase.aggregate({
        where: { companyId },
        _max: { purchaseNumber: true },
      });
      const purchaseNumber = (aggregate._max.purchaseNumber ?? 0) + 1;

      const establishment = await tx.establishment.findFirst({
        where: { id: dto.establishmentId, companyId, deletedAt: null },
      });
      if (!establishment) {
        throw new NotFoundException('Estabelecimento não encontrado');
      }

      const itemsData: {
        productId: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }[] = [];
      let totalAmount = 0;

      for (const item of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, companyId, deletedAt: null },
        });
        if (!product) {
          throw new NotFoundException(
            `Produto não encontrado: ${item.productId}`,
          );
        }
        const total = item.quantity * item.unitPrice;
        totalAmount += total;
        itemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total,
        });
      }

      return tx.purchase.create({
        data: {
          companyId,
          establishmentId: dto.establishmentId,
          supplierId: dto.supplierId,
          purchaseNumber,
          totalAmount,
          paymentCondition: dto.paymentCondition ?? PaymentCondition.A_VISTA,
          installments: dto.installments ?? 1,
          firstDueDate: dto.firstDueDate ? new Date(dto.firstDueDate) : null,
          intervalDays: dto.intervalDays ?? DEFAULT_INTERVAL_DAYS,
          notes: dto.notes,
          purchaseDate: dto.purchaseDate
            ? new Date(dto.purchaseDate)
            : new Date(),
          items: {
            create: itemsData,
          },
        },
        include: { items: true },
      });
    });
  }

  async findAll(
    companyId: string,
    filter: FilterPurchaseDto,
  ): Promise<{
    data: Purchase[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (filter.status) where['status'] = filter.status;
    if (filter.supplierId) where['supplierId'] = filter.supplierId;

    if (filter.startDate || filter.endDate) {
      const purchaseDate: Record<string, Date> = {};
      if (filter.startDate) purchaseDate['gte'] = new Date(filter.startDate);
      if (filter.endDate) purchaseDate['lte'] = new Date(filter.endDate);
      where['purchaseDate'] = purchaseDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          supplier: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Purchase> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
        establishment: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!purchase) throw new NotFoundException('Compra não encontrada');
    return purchase;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdatePurchaseDto,
  ): Promise<Purchase> {
    const purchase = await this.findOne(id, companyId);

    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas compras em RASCUNHO podem ser editadas',
      );
    }

    return this.prisma.purchase.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        paymentCondition: dto.paymentCondition,
        installments: dto.installments,
        firstDueDate: dto.firstDueDate ? new Date(dto.firstDueDate) : undefined,
        intervalDays: dto.intervalDays,
        notes: dto.notes,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
      },
      include: { items: true },
    });
  }

  async confirm(id: string, companyId: string): Promise<Purchase> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, companyId, deletedAt: null },
        include: { items: true },
      });

      if (!purchase) throw new NotFoundException('Compra não encontrada');
      if (purchase.status !== PurchaseStatus.DRAFT) {
        throw new BadRequestException(
          'Apenas compras em RASCUNHO podem ser confirmadas',
        );
      }

      for (const item of purchase.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, companyId, deletedAt: null },
        });

        if (!product) {
          throw new NotFoundException(
            `Produto não encontrado: ${item.productId}`,
          );
        }

        const qty = Number(item.quantity);

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: item.productId,
            type: StockMovementType.ENTRADA,
            quantity: qty,
            referenceId: purchase.id,
            reason: `Purchase #${purchase.purchaseNumber}`,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: Number(product.currentStock) + qty },
        });
      }

      if (purchase.paymentCondition === PaymentCondition.A_PRAZO) {
        await this.createPayables(tx, companyId, purchase);
      }

      return tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.CONFIRMED },
        include: { items: true },
      });
    });
  }

  /**
   * Gera um título a pagar por parcela.
   *
   * Só roda na confirmação: a compra em RASCUNHO ainda pode ser editada ou
   * excluída, e o financeiro não deve enxergar dívida que talvez não exista.
   */
  private async createPayables(
    tx: Prisma.TransactionClient,
    companyId: string,
    purchase: Purchase,
  ): Promise<void> {
    const firstDueDate =
      purchase.firstDueDate ?? addDays(new Date(), purchase.intervalDays);

    const installments = buildInstallments(
      Number(purchase.totalAmount),
      purchase.installments,
      firstDueDate,
      purchase.intervalDays,
    );

    await tx.financialEntry.createMany({
      data: installments.map((installment) => ({
        companyId,
        establishmentId: purchase.establishmentId,
        type: FinancialType.PAGAR,
        status: FinancialStatus.ABERTO,
        partnerId: purchase.supplierId,
        purchaseId: purchase.id,
        description: `Compra #${purchase.purchaseNumber} (${installment.installmentNumber}/${installment.installmentTotal})`,
        amount: installment.amount,
        dueDate: installment.dueDate,
        installmentNumber: installment.installmentNumber,
        installmentTotal: installment.installmentTotal,
      })),
    });
  }

  /**
   * Cancela os títulos a pagar da compra.
   *
   * Parcela já paga não é estornada em silêncio: apagar um pagamento perderia
   * o histórico de caixa, então o cancelamento é barrado e o estorno fica a
   * cargo do financeiro.
   */
  private async cancelPayables(
    tx: Prisma.TransactionClient,
    companyId: string,
    purchaseId: string,
  ): Promise<void> {
    const paid = await tx.financialEntry.findFirst({
      where: {
        purchaseId,
        companyId,
        deletedAt: null,
        type: FinancialType.PAGAR,
        status: { not: FinancialStatus.CANCELADO },
        payments: { some: {} },
      },
      select: { id: true },
    });

    if (paid) {
      throw new BadRequestException(
        'Compra possui parcelas pagas; estorne o financeiro antes',
      );
    }

    await tx.financialEntry.updateMany({
      where: {
        purchaseId,
        companyId,
        deletedAt: null,
        type: FinancialType.PAGAR,
        status: { not: FinancialStatus.CANCELADO },
      },
      data: { status: FinancialStatus.CANCELADO },
    });
  }

  async cancel(id: string, companyId: string): Promise<Purchase> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, companyId, deletedAt: null },
        include: { items: true },
      });

      if (!purchase) throw new NotFoundException('Compra não encontrada');

      if (
        purchase.status !== PurchaseStatus.DRAFT &&
        purchase.status !== PurchaseStatus.CONFIRMED
      ) {
        throw new BadRequestException('Esta compra não pode ser cancelada');
      }

      // Antes da devolução do estoque: se houver parcela paga o cancelamento
      // para aqui e nada é revertido pela metade
      await this.cancelPayables(tx, companyId, purchase.id);

      if (purchase.status === PurchaseStatus.CONFIRMED) {
        for (const item of purchase.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, companyId, deletedAt: null },
          });

          if (product) {
            const qty = Number(item.quantity);
            await tx.stockMovement.create({
              data: {
                companyId,
                productId: item.productId,
                type: StockMovementType.SAIDA,
                quantity: qty,
                referenceId: purchase.id,
                reason: `Cancellation of Purchase #${purchase.purchaseNumber}`,
              },
            });

            await tx.product.update({
              where: { id: item.productId },
              data: {
                currentStock: Math.max(0, Number(product.currentStock) - qty),
              },
            });
          }
        }
      }

      return tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.CANCELLED },
        include: { items: true },
      });
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const purchase = await this.findOne(id, companyId);

    if (
      purchase.status !== PurchaseStatus.DRAFT &&
      purchase.status !== PurchaseStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Apenas compras em RASCUNHO ou CANCELADAS podem ser excluídas',
      );
    }

    await this.prisma.purchase.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
