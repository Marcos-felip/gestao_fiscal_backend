import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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

    const DOMAIN_LABELS: Record<string, string> = {
      company: 'Empresa',
      users: 'Usuários',
      products: 'Produtos',
      sales: 'Vendas',
      purchases: 'Compras',
      stock: 'Estoque',
      partners: 'Parceiros',
    };

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, perms]) => ({
        domain,
        label: DOMAIN_LABELS[domain] || domain,
        permissions: perms,
      }));
  }

  async findByRole(role: MembershipRole): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permissionCode: true },
      orderBy: { permissionCode: 'asc' },
    });

    return rolePermissions.map((rp) => rp.permissionCode);
  }

  async updateRolePermissions(
    role: MembershipRole,
    permissionCodes: string[],
  ): Promise<string[]> {
    if (role !== 'MEMBER') {
      throw new BadRequestException(
        'Apenas as permissões do papel MEMBER podem ser gerenciadas.',
      );
    }

    const existingPermissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { code: true },
    });

    const validCodes = new Set(existingPermissions.map((p) => p.code));

    for (const code of permissionCodes) {
      if (!validCodes.has(code)) {
        throw new NotFoundException(`Permissão não encontrada: ${code}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { role },
      }),
      this.prisma.rolePermission.createMany({
        data: permissionCodes.map((code) => ({
          role,
          permissionCode: code,
        })),
      }),
    ]);

    return permissionCodes;
  }
}