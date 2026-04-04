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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const memberships_service_1 = require("./memberships.service");
const invite_member_dto_1 = require("./dto/invite-member.dto");
const update_role_dto_1 = require("./dto/update-role.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let MembershipsController = class MembershipsController {
    membershipsService;
    constructor(membershipsService) {
        this.membershipsService = membershipsService;
    }
    invite(companyId, dto) {
        return this.membershipsService.invite(companyId, dto);
    }
    findAll(companyId) {
        return this.membershipsService.findAll(companyId);
    }
    updateRole(id, companyId, dto) {
        return this.membershipsService.updateRole(id, companyId, dto);
    }
    remove(id, companyId) {
        return this.membershipsService.remove(id, companyId);
    }
};
exports.MembershipsController = MembershipsController;
__decorate([
    (0, common_1.Post)('invite'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER, client_1.MembershipRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Convidar usuário para a empresa (OWNER ou ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, invite_member_dto_1.InviteMemberDto]),
    __metadata("design:returntype", void 0)
], MembershipsController.prototype, "invite", null);
__decorate([
    (0, common_1.Get)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar membros da empresa ativa' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MembershipsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER),
    (0, swagger_1.ApiOperation)({ summary: 'Alterar papel de um membro (apenas OWNER)' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_role_dto_1.UpdateRoleDto]),
    __metadata("design:returntype", void 0)
], MembershipsController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER),
    (0, swagger_1.ApiOperation)({ summary: 'Remover membro da empresa (apenas OWNER)' }),
    (0, swagger_1.ApiResponse)({ status: 204 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], MembershipsController.prototype, "remove", null);
exports.MembershipsController = MembershipsController = __decorate([
    (0, swagger_1.ApiTags)('memberships'),
    (0, common_1.Controller)('memberships'),
    __metadata("design:paramtypes", [memberships_service_1.MembershipsService])
], MembershipsController);
//# sourceMappingURL=memberships.controller.js.map