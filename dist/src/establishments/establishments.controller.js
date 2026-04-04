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
exports.EstablishmentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const establishments_service_1 = require("./establishments.service");
const create_establishment_dto_1 = require("./dto/create-establishment.dto");
const update_establishment_dto_1 = require("./dto/update-establishment.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let EstablishmentsController = class EstablishmentsController {
    establishmentsService;
    constructor(establishmentsService) {
        this.establishmentsService = establishmentsService;
    }
    findAll(companyId) {
        return this.establishmentsService.findAll(companyId);
    }
    create(companyId, dto) {
        return this.establishmentsService.create(companyId, dto);
    }
    findOne(id, companyId) {
        return this.establishmentsService.findOne(id, companyId);
    }
    update(id, companyId, dto) {
        return this.establishmentsService.update(id, companyId, dto);
    }
    remove(id, companyId) {
        return this.establishmentsService.remove(id, companyId);
    }
};
exports.EstablishmentsController = EstablishmentsController;
__decorate([
    (0, common_1.Get)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar estabelecimentos da empresa ativa' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER, client_1.MembershipRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Criar novo estabelecimento' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_establishment_dto_1.CreateEstablishmentDto]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Buscar estabelecimento por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER, client_1.MembershipRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Atualizar estabelecimento' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_establishment_dto_1.UpdateEstablishmentDto]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.OWNER),
    (0, swagger_1.ApiOperation)({ summary: 'Excluir estabelecimento (não é possível excluir MATRIZ)' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "remove", null);
exports.EstablishmentsController = EstablishmentsController = __decorate([
    (0, swagger_1.ApiTags)('establishments'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('establishments'),
    __metadata("design:paramtypes", [establishments_service_1.EstablishmentsService])
], EstablishmentsController);
//# sourceMappingURL=establishments.controller.js.map