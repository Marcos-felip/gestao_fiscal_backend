import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Purchase, PurchaseStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { FilterPurchaseDto } from './dto/filter-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreatePurchaseDto): Promise<Purchase> {
    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.purchase.aggregate({
        where: { companyId, deletedAt: null },
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

      return tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.CONFIRMED },
        include: { items: true },
      });
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
