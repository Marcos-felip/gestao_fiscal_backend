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
exports.MembershipsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let MembershipsService = class MembershipsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async invite(companyId, dto) {
        const user = await this.prisma.user.findFirst({
            where: { email: dto.email, deletedAt: null },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found with this email');
        }
        const existing = await this.prisma.membership.findFirst({
            where: { userId: user.id, companyId, deletedAt: null },
        });
        if (existing) {
            throw new common_1.ConflictException('User is already a member of this company');
        }
        return this.prisma.membership.create({
            data: {
                userId: user.id,
                companyId,
                role: dto.role ?? client_1.MembershipRole.MEMBER,
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }
    async findAll(companyId) {
        return this.prisma.membership.findMany({
            where: { companyId, deletedAt: null },
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }
    async updateRole(id, companyId, dto) {
        const membership = await this.prisma.membership.findFirst({
            where: { id, companyId, deletedAt: null },
        });
        if (!membership) {
            throw new common_1.NotFoundException('Membership not found');
        }
        if (membership.role === client_1.MembershipRole.OWNER) {
            throw new common_1.BadRequestException('Cannot change the role of an OWNER');
        }
        return this.prisma.membership.update({
            where: { id },
            data: { role: dto.role },
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }
    async remove(id, companyId) {
        const membership = await this.prisma.membership.findFirst({
            where: { id, companyId, deletedAt: null },
        });
        if (!membership) {
            throw new common_1.NotFoundException('Membership not found');
        }
        if (membership.role === client_1.MembershipRole.OWNER) {
            throw new common_1.BadRequestException('Cannot remove the OWNER from the company');
        }
        await this.prisma.membership.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
};
exports.MembershipsService = MembershipsService;
exports.MembershipsService = MembershipsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MembershipsService);
//# sourceMappingURL=memberships.service.js.map