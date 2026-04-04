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
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let CompaniesService = class CompaniesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const company = await tx.company.create({
                data: {
                    name: dto.name,
                    type: dto.type,
                    phone: dto.phone,
                },
            });
            const membership = await tx.membership.create({
                data: {
                    userId,
                    companyId: company.id,
                    role: client_1.MembershipRole.OWNER,
                },
            });
            await tx.user.update({
                where: { id: userId },
                data: { companyActiveId: company.id },
            });
            return { company, membership };
        });
    }
    async findAllForUser(userId) {
        return this.prisma.company.findMany({
            where: {
                deletedAt: null,
                memberships: {
                    some: {
                        userId,
                        deletedAt: null,
                    },
                },
            },
            include: {
                memberships: {
                    where: { userId, deletedAt: null },
                    select: { role: true },
                },
            },
        });
    }
    async findOne(id, companyId) {
        if (id !== companyId) {
            throw new common_1.ForbiddenException('Acesso negado a esta empresa');
        }
        const company = await this.prisma.company.findFirst({
            where: { id, deletedAt: null },
        });
        if (!company) {
            throw new common_1.NotFoundException('Empresa não encontrada');
        }
        return company;
    }
    async onboard(companyId, dto) {
        const company = await this.prisma.company.findFirst({
            where: { id: companyId, deletedAt: null },
        });
        if (!company) {
            throw new common_1.NotFoundException('Empresa não encontrada');
        }
        if (company.isOnboarded) {
            throw new common_1.BadRequestException('Empresa já foi configurada');
        }
        return this.prisma.$transaction(async (tx) => {
            const existingMatriz = await tx.establishment.findFirst({
                where: {
                    companyId,
                    type: client_1.EstablishmentType.MATRIZ,
                    deletedAt: null,
                },
            });
            if (existingMatriz) {
                throw new common_1.ConflictException('Já existe um estabelecimento MATRIZ para esta empresa');
            }
            await tx.company.update({
                where: { id: companyId },
                data: {
                    cnpj: dto.cnpj,
                    taxRegime: dto.taxRegime,
                    ...(dto.phone !== undefined && { phone: dto.phone }),
                },
            });
            await tx.establishment.create({
                data: {
                    companyId,
                    type: client_1.EstablishmentType.MATRIZ,
                    name: dto.establishmentName,
                    inscricaoEstadual: dto.inscricaoEstadual,
                    inscricaoMunicipal: dto.inscricaoMunicipal,
                    cep: dto.cep,
                    street: dto.street,
                    number: dto.number,
                    complement: dto.complement,
                    neighborhood: dto.neighborhood,
                    city: dto.city,
                    state: dto.state,
                },
            });
            return tx.company.update({
                where: { id: companyId },
                data: { isOnboarded: true },
            });
        });
    }
    async update(companyId, dto) {
        const company = await this.prisma.company.findFirst({
            where: { id: companyId, deletedAt: null },
        });
        if (!company) {
            throw new common_1.NotFoundException('Empresa não encontrada');
        }
        return this.prisma.company.update({
            where: { id: companyId },
            data: dto,
        });
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map