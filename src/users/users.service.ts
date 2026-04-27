import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateActiveCompanyDto } from './dto/update-active-company.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { AddUserToCompanyMembershipDto } from './dto/add-membership.dto';
import { MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        forcePasswordChange: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { deletedAt: null },
          select: { id: true, companyId: true, role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const { memberships, companyActiveId, forcePasswordChange, ...rest } = user;
    
    // Encontrar o role do membership da empresa ativa
    let role: string | null = null;
    if (companyActiveId) {
      const activeCompanyMembership = memberships.find(
        (m) => m.companyId === companyActiveId,
      );
      role = activeCompanyMembership?.role ?? null;
    }

    return {
      ...rest,
      companyActiveId,
      role,
      forcePasswordChange,
      membershipsCount: memberships.length,
    };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    await this.getProfile(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        updatedAt: true,
      },
    });
  }

  async updateActiveCompany(userId: string, dto: UpdateActiveCompanyDto) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId: dto.companyId,
        deletedAt: null,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Usuário não é membro da empresa selecionada');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { companyActiveId: dto.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        updatedAt: true,
      },
    });
  }

  async createUser(dto: CreateUserDto) {
    // Verificar se a empresa existe
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Verificar se o e-mail já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const shouldForcePasswordChange = dto.forcePasswordChange ?? true;

    let passwordHash: string;
    let temporaryPassword: string | undefined;

    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 10);
      temporaryPassword = undefined;
    } else {
      temporaryPassword = randomBytes(9).toString('base64').substring(0, 12);
      passwordHash = await bcrypt.hash(temporaryPassword, 10);
    }

    const userName = dto.name || dto.email.split('@')[0];

    const newUser = await this.prisma.user.create({
      data: {
        name: userName,
        email: dto.email,
        passwordHash,
        forcePasswordChange: shouldForcePasswordChange,
        memberships: {
          create: {
            companyId: dto.companyId,
            role: dto.role,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            companyId: true,
          },
        },
      },
    });

    const membership = newUser.memberships[0];

    const result: Record<string, unknown> = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: membership.role,
      companyId: membership.companyId,
      createdAt: newUser.createdAt,
      forcePasswordChange: shouldForcePasswordChange,
    };

    if (temporaryPassword) {
      result['temporaryPassword'] = temporaryPassword;
    }

    return result;
  }

  async addMembership(
    userId: string,
    companyId: string,
    dto: AddUserToCompanyMembershipDto,
  ) {
    // Verificar se o usuário existe
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar se a empresa existe
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Verificar se já existe membership (unique constraint)
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        deletedAt: null,
      },
    });

    if (existingMembership) {
      throw new ConflictException('Usuário já é membro da empresa');
    }

    // Criar membership
    const membership = await this.prisma.membership.create({
      data: {
        userId,
        companyId,
        role: dto.role,
      },
      select: {
        id: true,
        userId: true,
        companyId: true,
        role: true,
        createdAt: true,
      },
    });

    return membership;
  }
}
