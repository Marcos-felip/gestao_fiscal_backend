import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  isProductFiscalComplete,
  listarPendenciasFiscais,
  ProductFiscalFields,
} from '../fiscal/emission/fiscal-rules';

/** Produto que ainda não pode ser vendido em NFC-e, com o que falta nele. */
export interface ProductFiscalPendency extends ProductFiscalFields {
  id: string;
  name: string;
  sku: string | null;
  pendencias: string[];
}

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
      cstPis: dto.cstPis ?? atual.cstPis,
      cstCofins: dto.cstCofins ?? atual.cstCofins,
      aliquotaIcms: numeroOuNulo(dto.aliquotaIcms ?? atual.aliquotaIcms),
      aliquotaPis: numeroOuNulo(dto.aliquotaPis ?? atual.aliquotaPis),
      aliquotaCofins: numeroOuNulo(dto.aliquotaCofins ?? atual.aliquotaCofins),
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
   * Produtos que travariam uma emissão, com o motivo de cada pendência.
   *
   * Filtra por `fiscalComplete: false` — a coluna já é derivada das regras do
   * motor na escrita — e recalcula os motivos para exibir ao usuário.
   */
  async findFiscalPending(
    companyId: string,
    pagination: PaginationDto,
  ): Promise<{
    data: ProductFiscalPendency[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
      isActive: true,
      fiscalComplete: false,
    };

    if (pagination.search) {
      where.name = { contains: pagination.search, mode: 'insensitive' };
    }

    const [company, produtos, total] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: { crt: true },
      }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sku: true,
          ncm: true,
          cfop: true,
          origin: true,
          csosn: true,
          cstIcms: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const data = produtos.map((produto) => ({
      ...produto,
      pendencias: listarPendenciasFiscais(produto, company?.crt),
    }));

    return { data, total, page, limit };
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

/**
 * As alíquotas vêm como `Decimal` do banco e como `number` do DTO; a checagem
 * de completude só precisa saber se há valor.
 */
function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
