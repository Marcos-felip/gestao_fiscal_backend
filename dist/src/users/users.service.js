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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                name: true,
                email: true,
                companyActiveId: true,
                createdAt: true,
                updatedAt: true,
                memberships: {
                    where: { deletedAt: null },
                    select: { id: true },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const { memberships, ...rest } = user;
        return { ...rest, membershipsCount: memberships.length };
    }
    async updateProfile(userId, dto) {
        await this.getProfile(userId);
        return this.prisma.user.update({
            where: { id: userId },
            data: dto,
            select: {
                id: true,
                name: true,
                email: true,
                companyActiveId: true,
                updatedAt: true,
            },
        });
    }
    async updateActiveCompany(userId, dto) {
        const membership = await this.prisma.membership.findFirst({
            where: {
                userId,
                companyId: dto.companyId,
                deletedAt: null,
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('User is not a member of the target company');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { companyActiveId: dto.companyId },
            select: {
                id: true,
                name: true,
                email: true,
                companyActiveId: true,
                updatedAt: true,
            },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map