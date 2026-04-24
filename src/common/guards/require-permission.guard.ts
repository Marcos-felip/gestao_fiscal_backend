import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

    const request = context.switchToHttp().getRequest();
    const membership = request.membership;

    if (!membership) {
      throw new ForbiddenException('Usuário não é membro de nenhuma empresa');
    }

    // Buscar as permissões do role
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role: membership.role,
      },
      select: {
        permissionCode: true,
      },
    });

    const hasPermission = rolePermissions.some(
      (rp) => rp.permissionCode === requiredPermission,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Sem permissão para acessar: ${requiredPermission}`,
      );
    }

    return true;
  }
}
