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
exports.SalesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const sales_service_1 = require("./sales.service");
const create_sale_dto_1 = require("./dto/create-sale.dto");
const update_sale_dto_1 = require("./dto/update-sale.dto");
const filter_sale_dto_1 = require("./dto/filter-sale.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let SalesController = class SalesController {
    salesService;
    constructor(salesService) {
        this.salesService = salesService;
    }
    create(companyId, dto) {
        return this.salesService.create(companyId, dto);
    }
    findAll(companyId, filter) {
        return this.salesService.findAll(companyId, filter);
    }
    findOne(id, companyId) {
        return this.salesService.findOne(id, companyId);
    }
    update(id, companyId, dto) {
        return this.salesService.update(id, companyId, dto);
    }
    confirm(id, companyId) {
        return this.salesService.confirm(id, companyId);
    }
    cancel(id, companyId) {
        return this.salesService.cancel(id, companyId);
    }
    remove(id, companyId) {
        return this.salesService.remove(id, companyId);
    }
};
exports.SalesController = SalesController;
__decorate([
    (0, common_1.Post)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Criar nova venda' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_sale_dto_1.CreateSaleDto]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar vendas' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, filter_sale_dto_1.FilterSaleDto]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Buscar venda por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Atualizar venda em RASCUNHO' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_sale_dto_1.UpdateSaleDto]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Confirmar venda e baixar estoque' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.ADMIN, client_1.MembershipRole.OWNER),
    (0, swagger_1.ApiOperation)({ summary: 'Cancelar venda' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "cancel", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.ADMIN, client_1.MembershipRole.OWNER),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Excluir venda em RASCUNHO ou CANCELADA' }),
    (0, swagger_1.ApiResponse)({ status: 204 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SalesController.prototype, "remove", null);
exports.SalesController = SalesController = __decorate([
    (0, swagger_1.ApiTags)('sales'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('sales'),
    __metadata("design:paramtypes", [sales_service_1.SalesService])
], SalesController);
//# sourceMappingURL=sales.controller.js.map