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
exports.PartnersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const partners_service_1 = require("./partners.service");
const create_partner_dto_1 = require("./dto/create-partner.dto");
const update_partner_dto_1 = require("./dto/update-partner.dto");
const filter_partner_dto_1 = require("./dto/filter-partner.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let PartnersController = class PartnersController {
    partnersService;
    constructor(partnersService) {
        this.partnersService = partnersService;
    }
    findAll(companyId, filter) {
        return this.partnersService.findAll(companyId, filter);
    }
    create(companyId, dto) {
        return this.partnersService.create(companyId, dto);
    }
    findOne(id, companyId) {
        return this.partnersService.findOne(id, companyId);
    }
    update(id, companyId, dto) {
        return this.partnersService.update(id, companyId, dto);
    }
    remove(id, companyId) {
        return this.partnersService.remove(id, companyId);
    }
};
exports.PartnersController = PartnersController;
__decorate([
    (0, common_1.Get)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all partners for the current company' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, filter_partner_dto_1.FilterPartnerDto]),
    __metadata("design:returntype", void 0)
], PartnersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new partner' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_partner_dto_1.CreatePartnerDto]),
    __metadata("design:returntype", void 0)
], PartnersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get a partner by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PartnersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update a partner' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_partner_dto_1.UpdatePartnerDto]),
    __metadata("design:returntype", void 0)
], PartnersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Soft-delete a partner' }),
    (0, swagger_1.ApiResponse)({ status: 204 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_company_decorator_1.CurrentCompany)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PartnersController.prototype, "remove", null);
exports.PartnersController = PartnersController = __decorate([
    (0, swagger_1.ApiTags)('partners'),
    (0, common_1.Controller)('partners'),
    __metadata("design:paramtypes", [partners_service_1.PartnersService])
], PartnersController);
//# sourceMappingURL=partners.controller.js.map