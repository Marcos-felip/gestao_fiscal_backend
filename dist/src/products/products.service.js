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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProductsService = class ProductsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(companyId, pagination) {
        const page = pagination.page ?? 1;
        const limit = pagination.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = {
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
    async findOne(id, companyId) {
        const product = await this.prisma.product.findFirst({
            where: { id, companyId, deletedAt: null },
        });
        if (!product) {
            throw new common_1.NotFoundException('Produto não encontrado');
        }
        return product;
    }
    async create(companyId, dto) {
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
    async update(id, companyId, dto) {
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
    async remove(id, companyId) {
        await this.findOne(id, companyId);
        await this.prisma.product.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map