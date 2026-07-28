import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAssignRole,
  assertCanManageMember,
} from '../common/utils/role-hierarchy';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async createMember(
    companyId: string,
    dto: CreateMemberDto,
    actorRole: MembershipRole,
  ) {
    const role = dto.role ?? MembershipRole.MEMBER;
    assertCanAssignRole(actorRole, role);

    // Verificar se o e-mail já está cadastrado
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('E-mail já cadastrado');
    }

    // Gerar senha provisória segura (12 caracteres alfanuméricos)
    const temporaryPassword = randomBytes(9)
      .toString('base64')
      .substring(0, 12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // Criar usuário + membership em transação atômica
    const membership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          forcePasswordChange: true,
          memberships: {
            create: {
              companyId,
              role,
            },
          },
        },
        include: {
          memberships: {
            where: { companyId },
            select: { id: true, userId: true, companyId: true, role: true },
          },
        },
      });

      const createdMembership = user.memberships[0];

      // Define a empresa ativa: sem isso o usuário loga mas o CompanyTenantGuard
      // barra tudo com "No active company selected"
      await tx.user.update({
        where: { id: user.id },
        data: { companyActiveId: companyId },
      });

      return {
        id: createdMembership.id,
        userId: createdMembership.userId,
        companyId: createdMembership.companyId,
        role: createdMembership.role,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      };
    });

    return membership;
  }

  async findAll(companyId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        profiles: {
          select: { profile: { select: { id: true, name: true } } },
          orderBy: { profile: { name: 'asc' } },
        },
      },
    });

    // Achata o vínculo N-N para a tela de usuários não precisar de uma chamada por linha
    return memberships.map(({ profiles, ...membership }) => ({
      ...membership,
      profiles: profiles.map((link) => link.profile),
    }));
  }

  async updateRole(
    id: string,
    companyId: string,
    dto: UpdateRoleDto,
    actorRole: MembershipRole,
  ) {
    assertCanAssignRole(actorRole, dto.role);

    const membership = await this.prisma.membership.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!membership) {
      throw new NotFoundException('Associação não encontrada');
    }

    if (membership.role === MembershipRole.OWNER) {
      throw new BadRequestException(
        'Não é possível alterar o papel de um OWNER',
      );
    }

    return this.prisma.membership.update({
      where: { id },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async remove(id: string, companyId: string, actorRole: MembershipRole) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!membership) {
      throw new NotFoundException('Associação não encontrada');
    }

    if (membership.role === MembershipRole.OWNER) {
      throw new BadRequestException(
        'Não é possível remover o OWNER da empresa',
      );
    }

    assertCanManageMember(actorRole, membership.role);

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      const remaining = await tx.membership.findMany({
        where: { userId: membership.userId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { companyId: true },
      });

      const user = await tx.user.findUnique({
        where: { id: membership.userId },
        select: { companyActiveId: true },
      });

      const activeCompanyStillValid = remaining.some(
        (m) => m.companyId === user?.companyActiveId,
      );

      if (activeCompanyStillValid) {
        return;
      }

      // A empresa ativa apontava para a empresa de onde o usuário saiu. Sem isso
      // ele continua logando e recebe "Not a member of active company" em tudo.
      await tx.user.update({
        where: { id: membership.userId },
        data: {
          companyActiveId: remaining[0]?.companyId ?? null,
          // Sem nenhuma empresa restante, encerra a sessão: o refresh token
          // manteria o removido autenticado por até 7 dias
          ...(remaining.length === 0 ? { refreshToken: null } : {}),
        },
      });
    });
  }
}
