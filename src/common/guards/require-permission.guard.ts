import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class RequirePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não há permissão requerida, permite acesso
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      membership?: { id: string; role: MembershipRole; companyId: string };
    }>();
    const membership = request.membership;

    if (!membership) {
      throw new ForbiddenException('Usuário não é membro de nenhuma empresa');
    }

    // OWNER tem acesso total por definição — não depende do que está cadastrado
    if (membership.role === MembershipRole.OWNER) {
      return true;
    }

    // Permissões são resolvidas dentro da empresa ativa
    const granted = await this.prisma.companyRolePermission.findFirst({
      where: {
        companyId: membership.companyId,
        role: membership.role,
        permissionCode: requiredPermission,
      },
      select: { permissionCode: true },
    });

    if (granted) {
      return true;
    }

    // MEMBER acumula as permissões dos perfis vinculados a ele
    if (membership.role === MembershipRole.MEMBER) {
      const grantedByProfile =
        await this.prisma.permissionProfilePermission.findFirst({
          where: {
            permissionCode: requiredPermission,
            profile: {
              companyId: membership.companyId,
              memberships: { some: { membershipId: membership.id } },
            },
          },
          select: { permissionCode: true },
        });

      if (grantedByProfile) {
        return true;
      }
    }

    throw new ForbiddenException(
      `Sem permissão para acessar: ${requiredPermission}`,
    );
  }
}
