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
exports.StockService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let StockService = class StockService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createMovement(companyId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const product = await tx.product.findFirst({
                where: { id: dto.productId, companyId, deletedAt: null },
            });
            if (!product) {
                throw new common_1.NotFoundException('Product not found');
            }
            const currentStock = Number(product.currentStock);
            let newStock;
            switch (dto.type) {
                case client_1.StockMovementType.ENTRADA:
                    newStock = currentStock + dto.quantity;
                    break;
                case client_1.StockMovementType.SAIDA:
                    newStock = currentStock - dto.quantity;
                    if (newStock < 0) {
                        throw new common_1.BadRequestException('Insufficient stock');
                    }
                    break;
                case client_1.StockMovementType.AJUSTE:
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
    async findAll(companyId, filter) {
        const page = filter.page ?? 1;
        const limit = filter.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = { companyId, deletedAt: null };
        if (filter.productId) {
            where['productId'] = filter.productId;
        }
        if (filter.type) {
            where['type'] = filter.type;
        }
        if (filter.startDate || filter.endDate) {
            const createdAt = {};
            if (filter.startDate)
                createdAt['gte'] = new Date(filter.startDate);
            if (filter.endDate)
                createdAt['lte'] = new Date(filter.endDate);
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
};
exports.StockService = StockService;
exports.StockService = StockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StockService);
//# sourceMappingURL=stock.service.js.map