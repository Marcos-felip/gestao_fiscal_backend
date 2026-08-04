import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  isProductFiscalComplete,
  ProductFiscalFields,
} from '../fiscal/emission/fiscal-rules';

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
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return product;
  }

  async create(companyId: string, dto: CreateProductDto): Promise<Product> {
    const dadosFiscais = {
      ncm: dto.ncm,
      cest: dto.cest,
      cfop: dto.cfop,
      origin: dto.origin,
      csosn: dto.csosn,
      cstIcms: dto.cstIcms,
      cstPis: dto.cstPis,
      cstCofins: dto.cstCofins,
      aliquotaIcms: dto.aliquotaIcms,
      aliquotaPis: dto.aliquotaPis,
      aliquotaCofins: dto.aliquotaCofins,
    };

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
        ...dadosFiscais,
        fiscalComplete: await this.derivarFiscalComplete(
          companyId,
          dadosFiscais,
        ),
        technicalAttributes: dto.technicalAttributes as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const atual = await this.findOne(id, companyId);

    // O campo derivado vale para o cadastro depois da atualização.
    const dadosFiscais = {
      ncm: dto.ncm ?? atual.ncm,
      cest: dto.cest ?? atual.cest,
      cfop: dto.cfop ?? atual.cfop,
      origin: dto.origin ?? atual.origin,
      csosn: dto.csosn ?? atual.csosn,
      cstIcms: dto.cstIcms ?? atual.cstIcms,
    };

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
        csosn: dto.csosn,
        cstIcms: dto.cstIcms,
        cstPis: dto.cstPis,
        cstCofins: dto.cstCofins,
        aliquotaIcms: dto.aliquotaIcms,
        aliquotaPis: dto.aliquotaPis,
        aliquotaCofins: dto.aliquotaCofins,
        fiscalComplete: await this.derivarFiscalComplete(
          companyId,
          dadosFiscais,
        ),
        technicalAttributes: dto.technicalAttributes as
          | Prisma.InputJsonValue
          | undefined,
        isActive: dto.isActive,
      },
    });
  }

  /**
   * `fiscalComplete` é derivado das mesmas regras que o motor fiscal aplica —
   * o produto só entra numa NFC-e se passar por elas.
   */
  private async derivarFiscalComplete(
    companyId: string,
    dadosFiscais: ProductFiscalFields,
  ): Promise<boolean> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { crt: true },
    });

    return isProductFiscalComplete(dadosFiscais, company?.crt);
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOne(id, companyId);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
