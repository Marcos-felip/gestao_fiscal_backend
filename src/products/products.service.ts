import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    pagination: PaginationDto,
  ): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      companyId,
      deletedAt: null,
      isActive: true,
    };

    if (pagination.search) {
      where['name'] = { contains: pagination.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async create(companyId: string, dto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        sku: dto.sku,
        barcode: dto.barcode,
        unit: dto.unit,
        costPrice: dto.costPrice,
        salePrice: dto.salePrice,
        minStock: dto.minStock,
        ncm: dto.ncm,
        cest: dto.cest,
        cfop: dto.cfop,
        origin: dto.origin,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    await this.findOne(id, companyId);

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        sku: dto.sku,
        barcode: dto.barcode,
        unit: dto.unit,
        costPrice: dto.costPrice,
        salePrice: dto.salePrice,
        minStock: dto.minStock,
        ncm: dto.ncm,
        cest: dto.cest,
        cfop: dto.cfop,
        origin: dto.origin,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOne(id, companyId);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
