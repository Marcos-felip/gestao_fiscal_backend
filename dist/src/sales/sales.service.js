"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let SalesService = class SalesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(companyId, dto) {
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
                throw new common_1.NotFoundException('Estabelecimento não encontrado');
            }
            const itemsData = [];
            let itemsTotal = 0;
            for (const item of dto.items) {
                const product = await tx.product.findFirst({
                    where: { id: item.productId, companyId, deletedAt: null },
                });
                if (!product) {
                    throw new common_1.NotFoundException(`Produto não encontrado: ${item.productId}`);
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
    async findAll(companyId, filter) {
        const page = filter.page ?? 1;
        const limit = filter.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = { companyId, deletedAt: null };
        if (filter.status)
            where['status'] = filter.status;
        if (filter.clientId)
            where['clientId'] = filter.clientId;
        if (filter.startDate || filter.endDate) {
            const saleDate = {};
            if (filter.startDate)
                saleDate['gte'] = new Date(filter.startDate);
            if (filter.endDate)
                saleDate['lte'] = new Date(filter.endDate);
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
    async findOne(id, companyId) {
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
        if (!sale)
            throw new common_1.NotFoundException('Venda não encontrada');
        return sale;
    }
    async update(id, companyId, dto) {
        const sale = await this.findOne(id, companyId);
        if (sale.status !== client_1.SaleStatus.DRAFT) {
            throw new common_1.BadRequestException('Apenas vendas em RASCUNHO podem ser editadas');
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
    async confirm(id, companyId) {
        return this.prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findFirst({
                where: { id, companyId, deletedAt: null },
                include: { items: true },
            });
            if (!sale)
                throw new common_1.NotFoundException('Venda não encontrada');
            if (sale.status !== client_1.SaleStatus.DRAFT) {
                throw new common_1.BadRequestException('Apenas vendas em RASCUNHO podem ser confirmadas');
            }
            for (const item of sale.items) {
                const product = await tx.product.findFirst({
                    where: { id: item.productId, companyId, deletedAt: null },
                });
                if (!product) {
                    throw new common_1.NotFoundException(`Product not found: ${item.productId}`);
                }
                const currentStock = Number(product.currentStock);
                const qty = Number(item.quantity);
                if (currentStock < qty) {
                    throw new common_1.BadRequestException(`Estoque insuficiente para o produto ${product.name}`);
                }
                await tx.stockMovement.create({
                    data: {
                        companyId,
                        productId: item.productId,
                        type: client_1.StockMovementType.SAIDA,
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
                data: { status: client_1.SaleStatus.CONFIRMED },
                include: { items: true },
            });
        });
    }
    async cancel(id, companyId) {
        return this.prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findFirst({
                where: { id, companyId, deletedAt: null },
                include: { items: true },
            });
            if (!sale)
                throw new common_1.NotFoundException('Venda não encontrada');
            if (sale.status !== client_1.SaleStatus.DRAFT &&
                sale.status !== client_1.SaleStatus.CONFIRMED) {
                throw new common_1.BadRequestException('Esta venda não pode ser cancelada');
            }
            if (sale.status === client_1.SaleStatus.CONFIRMED) {
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
                                type: client_1.StockMovementType.ENTRADA,
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
                data: { status: client_1.SaleStatus.CANCELLED },
                include: { items: true },
            });
        });
    }
    async remove(id, companyId) {
        const sale = await this.findOne(id, companyId);
        if (sale.status !== client_1.SaleStatus.DRAFT &&
            sale.status !== client_1.SaleStatus.CANCELLED) {
            throw new common_1.BadRequestException('Apenas vendas em RASCUNHO ou CANCELADAS podem ser excluídas');
        }
        await this.prisma.sale.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.SalesService = SalesService;
exports.SalesService = SalesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SalesService);
//# sourceMappingURL=sales.service.js.map