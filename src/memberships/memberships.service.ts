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
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async createMember(companyId: string, dto: CreateMemberDto) {
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
              role: dto.role ?? MembershipRole.MEMBER,
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
    return this.prisma.membership.findMany({
      where: { companyId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async updateRole(id: string, companyId: string, dto: UpdateRoleDto) {
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

  async remove(id: string, companyId: string) {
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

    await this.prisma.membership.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
