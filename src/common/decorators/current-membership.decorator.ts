import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export interface CurrentMembershipData {
  id: string;
  role: MembershipRole;
  companyId: string;
}

export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentMembershipData => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ membership: CurrentMembershipData }>();
    return request.membership;
  },
);
