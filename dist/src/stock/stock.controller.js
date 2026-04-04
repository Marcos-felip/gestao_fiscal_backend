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
exports.StockController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const stock_service_1 = require("./stock.service");
const create_stock_movement_dto_1 = require("./dto/create-stock-movement.dto");
const filter_stock_movement_dto_1 = require("./dto/filter-stock-movement.dto");
const tenant_protected_decorator_1 = require("../common/decorators/tenant-protected.decorator");
const current_company_decorator_1 = require("../common/decorators/current-company.decorator");
let StockController = class StockController {
    stockService;
    constructor(stockService) {
        this.stockService = stockService;
    }
    createMovement(companyId, dto) {
        return this.stockService.createMovement(companyId, dto);
    }
    findAll(companyId, filter) {
        return this.stockService.findAll(companyId, filter);
    }
};
exports.StockController = StockController;
__decorate([
    (0, common_1.Post)('movements'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a stock movement' }),
    (0, swagger_1.ApiResponse)({ status: 201 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_stock_movement_dto_1.CreateStockMovementDto]),
    __metadata("design:returntype", void 0)
], StockController.prototype, "createMovement", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, tenant_protected_decorator_1.TenantProtected)(),
    (0, swagger_1.ApiOperation)({ summary: 'List stock movements' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    __param(0, (0, current_company_decorator_1.CurrentCompany)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, filter_stock_movement_dto_1.FilterStockMovementDto]),
    __metadata("design:returntype", void 0)
], StockController.prototype, "findAll", null);
exports.StockController = StockController = __decorate([
    (0, swagger_1.ApiTags)('stock'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('stock'),
    __metadata("design:paramtypes", [stock_service_1.StockService])
], StockController);
//# sourceMappingURL=stock.controller.js.map