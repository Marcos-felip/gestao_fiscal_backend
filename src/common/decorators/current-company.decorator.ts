import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentCompany = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().companyId;
  },
);
