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
exports.PartnersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let PartnersService = class PartnersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(companyId, filter) {
        const page = filter.page ?? 1;
        const limit = filter.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = {
            companyId,
            deletedAt: null,
        };
        if (filter.type) {
            where['type'] = filter.type;
        }
        if (filter.search) {
            where['name'] = { contains: filter.search, mode: 'insensitive' };
        }
        const [data, total] = await Promise.all([
            this.prisma.partner.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
            this.prisma.partner.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    async findOne(id, companyId) {
        const partner = await this.prisma.partner.findFirst({
            where: { id, companyId, deletedAt: null },
        });
        if (!partner) {
            throw new common_1.NotFoundException('Partner not found');
        }
        return partner;
    }
    async create(companyId, dto) {
        return this.prisma.partner.create({
            data: {
                companyId,
                type: dto.type,
                personType: dto.personType,
                name: dto.name,
                tradeName: dto.tradeName,
                cpfCnpj: dto.cpfCnpj,
                rgIe: dto.rgIe,
                email: dto.email,
                phone: dto.phone,
                cep: dto.cep,
                street: dto.street,
                number: dto.number,
                complement: dto.complement,
                neighborhood: dto.neighborhood,
                city: dto.city,
                state: dto.state,
            },
        });
    }
    async update(id, companyId, dto) {
        await this.findOne(id, companyId);
        return this.prisma.partner.update({
            where: { id },
            data: {
                type: dto.type,
                personType: dto.personType,
                name: dto.name,
                tradeName: dto.tradeName,
                cpfCnpj: dto.cpfCnpj,
                rgIe: dto.rgIe,
                email: dto.email,
                phone: dto.phone,
                cep: dto.cep,
                street: dto.street,
                number: dto.number,
                complement: dto.complement,
                neighborhood: dto.neighborhood,
                city: dto.city,
                state: dto.state,
                isActive: dto.isActive,
            },
        });
    }
    async remove(id, companyId) {
        await this.findOne(id, companyId);
        await this.prisma.partner.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.PartnersService = PartnersService;
exports.PartnersService = PartnersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PartnersService);
//# sourceMappingURL=partners.service.js.map