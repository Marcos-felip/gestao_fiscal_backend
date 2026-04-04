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
exports.PurchasesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let PurchasesService = class PurchasesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(companyId, dto) {
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
                throw new common_1.NotFoundException('Establishment not found');
            }
            const itemsData = [];
            let totalAmount = 0;
            for (const item of dto.items) {
                const product = await tx.product.findFirst({
                    where: { id: item.productId, companyId, deletedAt: null },
                });
                if (!product) {
                    throw new common_1.NotFoundException(`Product not found: ${item.productId}`);
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
    async findAll(companyId, filter) {
        const page = filter.page ?? 1;
        const limit = filter.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = { companyId, deletedAt: null };
        if (filter.status)
            where['status'] = filter.status;
        if (filter.supplierId)
            where['supplierId'] = filter.supplierId;
        if (filter.startDate || filter.endDate) {
            const purchaseDate = {};
            if (filter.startDate)
                purchaseDate['gte'] = new Date(filter.startDate);
            if (filter.endDate)
                purchaseDate['lte'] = new Date(filter.endDate);
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
    async findOne(id, companyId) {
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
        if (!purchase)
            throw new common_1.NotFoundException('Purchase not found');
        return purchase;
    }
    async update(id, companyId, dto) {
        const purchase = await this.findOne(id, companyId);
        if (purchase.status !== client_1.PurchaseStatus.DRAFT) {
            throw new common_1.BadRequestException('Only DRAFT purchases can be updated');
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
    async confirm(id, companyId) {
        return this.prisma.$transaction(async (tx) => {
            const purchase = await tx.purchase.findFirst({
                where: { id, companyId, deletedAt: null },
                include: { items: true },
            });
            if (!purchase)
                throw new common_1.NotFoundException('Purchase not found');
            if (purchase.status !== client_1.PurchaseStatus.DRAFT) {
                throw new common_1.BadRequestException('Only DRAFT purchases can be confirmed');
            }
            for (const item of purchase.items) {
                const product = await tx.product.findFirst({
                    where: { id: item.productId, companyId, deletedAt: null },
                });
                if (!product) {
                    throw new common_1.NotFoundException(`Product not found: ${item.productId}`);
                }
                const qty = Number(item.quantity);
                await tx.stockMovement.create({
                    data: {
                        companyId,
                        productId: item.productId,
                        type: client_1.StockMovementType.ENTRADA,
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
                data: { status: client_1.PurchaseStatus.CONFIRMED },
                include: { items: true },
            });
        });
    }
    async cancel(id, companyId) {
        return this.prisma.$transaction(async (tx) => {
            const purchase = await tx.purchase.findFirst({
                where: { id, companyId, deletedAt: null },
                include: { items: true },
            });
            if (!purchase)
                throw new common_1.NotFoundException('Purchase not found');
            if (purchase.status !== client_1.PurchaseStatus.DRAFT &&
                purchase.status !== client_1.PurchaseStatus.CONFIRMED) {
                throw new common_1.BadRequestException('Purchase cannot be cancelled');
            }
            if (purchase.status === client_1.PurchaseStatus.CONFIRMED) {
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
                                type: client_1.StockMovementType.SAIDA,
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
                data: { status: client_1.PurchaseStatus.CANCELLED },
                include: { items: true },
            });
        });
    }
    async remove(id, companyId) {
        const purchase = await this.findOne(id, companyId);
        if (purchase.status !== client_1.PurchaseStatus.DRAFT &&
            purchase.status !== client_1.PurchaseStatus.CANCELLED) {
            throw new common_1.BadRequestException('Only DRAFT or CANCELLED purchases can be deleted');
        }
        await this.prisma.purchase.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.PurchasesService = PurchasesService;
exports.PurchasesService = PurchasesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PurchasesService);
//# sourceMappingURL=purchases.service.js.map