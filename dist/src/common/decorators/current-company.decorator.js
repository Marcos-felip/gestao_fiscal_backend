"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentCompany = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentCompany = (0, common_1.createParamDecorator)((_, ctx) => {
    return ctx.switchToHttp().getRequest().companyId;
});
//# sourceMappingURL=current-company.decorator.js.map