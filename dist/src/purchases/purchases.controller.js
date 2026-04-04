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
exports.PurchasesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const purchases_service_1 = require("./purchases.service");
const create_purchase_dto_1 = require("./dto/create-purchase.dto");
const update_purchase_dto_1 = require("./dto/update-purchase.dto");
const filter_purchase_dto_1 = require("./dto/filter-purchase.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let PurchasesController = class PurchasesController {
    purchasesService;
    constructor(purchasesService) {
        this.purchasesService = purchasesService;
    }
    create(companyId, dto) {
        return this.purchasesService.create(companyId, dto);
    }
    findAll(companyId, filter) {
        return this.purchasesService.findAll(companyId, filter);
    }
    findOne(id, companyId) {
        return this.purchasesService.findOne(id, companyId);
    }
    update(id, companyId, dto) {
        return this.purchasesService.update(id, companyId, dto);
    }
    confirm(id, companyId) {
        return this.purchasesService.confirm(id, companyId);
    }
    cancel(id, companyId) {
        return this.purchasesService.cancel(id, companyId);
    }
    remove(id, companyId) {
        return this.purchasesService.remove(id, companyId);
    }
};
exports.PurchasesController = PurchasesController;
__decorate([
    (0, common_1.Post)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new purchase' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_purchase_dto_1.CreatePurchaseDto]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'List purchases' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, filter_purchase_dto_1.FilterPurchaseDto]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get a purchase by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update a DRAFT purchase' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_purchase_dto_1.UpdatePurchaseDto]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm a purchase and add stock' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.ADMIN, client_1.MembershipRole.OWNER),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a purchase' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "cancel", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(client_1.MembershipRole.ADMIN, client_1.MembershipRole.OWNER),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete a DRAFT or CANCELLED purchase' }),
    (0, swagger_1.ApiResponse)({ status: 204 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PurchasesController.prototype, "remove", null);
exports.PurchasesController = PurchasesController = __decorate([
    (0, swagger_1.ApiTags)('purchases'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('purchases'),
    __metadata("design:paramtypes", [purchases_service_1.PurchasesService])
], PurchasesController);
//# sourceMappingURL=purchases.controller.js.map