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
exports.EstablishmentsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let EstablishmentsService = class EstablishmentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(companyId, dto) {
        if (dto.type === client_1.EstablishmentType.MATRIZ) {
            const existingMatriz = await this.prisma.establishment.findFirst({
                where: { companyId, type: client_1.EstablishmentType.MATRIZ, deletedAt: null },
            });
            if (existingMatriz) {
                throw new common_1.ConflictException('Já existe um estabelecimento MATRIZ para esta empresa');
            }
        }
        return this.prisma.establishment.create({
            data: {
                companyId,
                name: dto.name,
                type: dto.type,
                cnpj: dto.cnpj,
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
    }
    async findAll(companyId) {
        return this.prisma.establishment.findMany({
            where: { companyId, deletedAt: null },
        });
    }
    async findOne(id, companyId) {
        const establishment = await this.prisma.establishment.findFirst({
            where: { id, companyId, deletedAt: null },
        });
        if (!establishment) {
            throw new common_1.NotFoundException('Estabelecimento não encontrado');
        }
        return establishment;
    }
    async update(id, companyId, dto) {
        await this.findOne(id, companyId);
        return this.prisma.establishment.update({
            where: { id },
            data: dto,
        });
    }
    async remove(id, companyId) {
        const establishment = await this.findOne(id, companyId);
        if (establishment.type === client_1.EstablishmentType.MATRIZ) {
            throw new common_1.BadRequestException('Não é possível excluir o estabelecimento MATRIZ');
        }
        return this.prisma.establishment.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.EstablishmentsService = EstablishmentsService;
exports.EstablishmentsService = EstablishmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EstablishmentsService);
//# sourceMappingURL=establishments.service.js.map