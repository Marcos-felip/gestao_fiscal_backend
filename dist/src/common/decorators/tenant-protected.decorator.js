"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantProtected = TenantProtected;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../guards/jwt-auth.guard");
const company_tenant_guard_1 = require("../guards/company-tenant.guard");
const roles_guard_1 = require("../guards/roles.guard");
const roles_decorator_1 = require("./roles.decorator");
function TenantProtected(...roles) {
    return (0, common_1.applyDecorators)(...(roles.length > 0 ? [(0, roles_decorator_1.Roles)(...roles)] : []), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, company_tenant_guard_1.CompanyTenantGuard, roles_guard_1.RolesGuard), (0, swagger_1.ApiBearerAuth)());
}
//# sourceMappingURL=tenant-protected.decorator.js.map