import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        memberships: {
          where: { deletedAt: null },
        },
      },
    });

    if (!user?.companyActiveId) {
      throw new ForbiddenException('No active company selected');
    }

    const membership = user.memberships.find(
      (m) => m.companyId === user.companyActiveId,
    );

    if (!membership) {
      throw new ForbiddenException('Not a member of active company');
    }

    request.companyId = user.companyActiveId;
    request.membership = {
      id: membership.id,
      role: membership.role,
      companyId: membership.companyId,
    };

    return true;
  }
}
