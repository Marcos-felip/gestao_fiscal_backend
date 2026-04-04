import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Sale, SaleStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

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

      const itemsData: {
        productId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        total: number;
      }[] = [];
      let itemsTotal = 0;

      for (const item of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, companyId, deletedAt: null },
        });
        if (!product) {
          throw new NotFoundException(
            `Produto não encontrado: ${item.productId}`,
          );
        }
        const itemDiscount = item.discount ?? 0;
        const total = item.quantity * item.unitPrice - itemDiscount;
        itemsTotal += total;
        itemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: itemDiscount,
          total,
        });
      }

      const saleDiscount = dto.discount ?? 0;
      const totalAmount = itemsTotal - saleDiscount;

      return tx.sale.create({
        data: {
          companyId,
          establishmentId: dto.establishmentId,
          clientId: dto.clientId,
          saleNumber,
          totalAmount,
          discount: saleDiscount,
          notes: dto.notes,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
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
    filter: FilterSaleDto,
  ): Promise<{ data: Sale[]; total: number; page: number; limit: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (filter.status) where['status'] = filter.status;
    if (filter.clientId) where['clientId'] = filter.clientId;

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
          client: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Sale> {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
        establishment: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateSaleDto,
  ): Promise<Sale> {
    const sale = await this.findOne(id, companyId);

    if (sale.status !== SaleStatus.DRAFT) {
      throw new BadRequestException('Apenas vendas em RASCUNHO podem ser editadas');
    }

    return this.prisma.sale.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        discount: dto.discount,
        notes: dto.notes,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : undefined,
      },
      include: { items: true },
    });
  }

  async confirm(id: string, companyId: string): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId, deletedAt: null },
        include: { items: true },
      });

      if (!sale) throw new NotFoundException('Venda não encontrada');
      if (sale.status !== SaleStatus.DRAFT) {
        throw new BadRequestException('Apenas vendas em RASCUNHO podem ser confirmadas');
      }

      for (const item of sale.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, companyId, deletedAt: null },
        });

        if (!product) {
          throw new NotFoundException(`Product not found: ${item.productId}`);
        }

        const currentStock = Number(product.currentStock);
        const qty = Number(item.quantity);

        if (currentStock < qty) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${product.name}`,
          );
        }

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: item.productId,
            type: StockMovementType.SAIDA,
            quantity: qty,
            referenceId: sale.id,
            reason: `Sale #${sale.saleNumber}`,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: currentStock - qty },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: SaleStatus.CONFIRMED },
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

      if (
        sale.status !== SaleStatus.DRAFT &&
        sale.status !== SaleStatus.CONFIRMED
      ) {
        throw new BadRequestException('Esta venda não pode ser cancelada');
      }

      if (sale.status === SaleStatus.CONFIRMED) {
        for (const item of sale.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, companyId, deletedAt: null },
          });

          if (product) {
            const qty = Number(item.quantity);
            await tx.stockMovement.create({
              data: {
                companyId,
                productId: item.productId,
                type: StockMovementType.ENTRADA,
                quantity: qty,
                referenceId: sale.id,
                reason: `Cancellation of Sale #${sale.saleNumber}`,
              },
            });

            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: Number(product.currentStock) + qty },
            });
          }
        }
      }

      return tx.sale.update({
        where: { id },
        data: { status: SaleStatus.CANCELLED },
        include: { items: true },
      });
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const sale = await this.findOne(id, companyId);

    if (
      sale.status !== SaleStatus.DRAFT &&
      sale.status !== SaleStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Apenas vendas em RASCUNHO ou CANCELADAS podem ser excluídas',
      );
    }

    await this.prisma.sale.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
