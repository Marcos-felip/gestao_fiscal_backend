import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipRole } from '@prisma/client';

export interface PermissionItem {
  code: string;
  description: string;
}

export interface PermissionGroup {
  domain: string;
  label: string;
  permissions: PermissionItem[];
}

const DOMAIN_LABELS: Record<string, string> = {
  company: 'Empresa',
  users: 'Usuários',
  establishments: 'Estabelecimentos',
  products: 'Produtos',
  purchases: 'Compras',
  stock: 'Estoque',
  partners: 'Parceiros',
};

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PermissionGroup[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });

    const groups: Record<string, PermissionItem[]> = {};
    for (const perm of permissions) {
      const domain = perm.code.split('.')[0];
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push({
        code: perm.code,
        description: perm.description,
      });
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, perms]) => ({
        domain,
        label: DOMAIN_LABELS[domain] || domain,
        permissions: perms,
      }));
  }

  /**
   * Permissões efetivas de um papel dentro da empresa.
   * OWNER tem acesso total, portanto recebe o catálogo completo.
   */
  async findByRole(companyId: string, role: MembershipRole): Promise<string[]> {
    if (role === MembershipRole.OWNER) {
      const all = await this.prisma.permission.findMany({
        select: { code: true },
        orderBy: { code: 'asc' },
      });
      return all.map((p) => p.code);
    }

    const rolePermissions = await this.prisma.companyRolePermission.findMany({
      where: { companyId, role },
      select: { permissionCode: true },
      orderBy: { permissionCode: 'asc' },
    });

    return rolePermissions.map((rp) => rp.permissionCode);
  }

  async updateRolePermissions(
    companyId: string,
    role: MembershipRole,
    permissionCodes: string[],
  ): Promise<string[]> {
    if (role !== MembershipRole.MEMBER) {
      throw new BadRequestException(
        'Apenas as permissões do papel MEMBER podem ser gerenciadas.',
      );
    }

    const codes = [...new Set(permissionCodes)].sort();

    const existingPermissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });

    const validCodes = new Set(existingPermissions.map((p) => p.code));

    for (const code of codes) {
      if (!validCodes.has(code)) {
        throw new NotFoundException(`Permissão não encontrada: ${code}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.companyRolePermission.deleteMany({
        where: { companyId, role },
      }),
      this.prisma.companyRolePermission.createMany({
        data: codes.map((code) => ({
          companyId,
          role,
          permissionCode: code,
        })),
      }),
    ]);

    return codes;
  }
}
