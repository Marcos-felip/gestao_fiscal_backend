import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovement, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async createMovement(
    companyId: string,
    dto: CreateStockMovementDto,
  ): Promise<StockMovement> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, companyId, deletedAt: null },
      });

      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }

      const currentStock = Number(product.currentStock);
      let newStock: number;

      switch (dto.type) {
        case StockMovementType.ENTRADA:
          newStock = currentStock + dto.quantity;
          break;
        case StockMovementType.SAIDA:
          newStock = currentStock - dto.quantity;
          if (newStock < 0) {
            throw new BadRequestException('Estoque insuficiente');
          }
          break;
        case StockMovementType.AJUSTE:
          newStock = dto.quantity;
          break;
        default:
          newStock = currentStock;
      }

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      });

      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: newStock },
      });

      return movement;
    });
  }

  async findAll(
    companyId: string,
    filter: FilterStockMovementDto,
  ): Promise<{
    data: StockMovement[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (filter.productId) {
      where['productId'] = filter.productId;
    }

    if (filter.type) {
      where['type'] = filter.type;
    }

    if (filter.startDate || filter.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filter.startDate) createdAt['gte'] = new Date(filter.startDate);
      if (filter.endDate) createdAt['lte'] = new Date(filter.endDate);
      where['createdAt'] = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
