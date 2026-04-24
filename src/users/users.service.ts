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

    const { memberships, companyActiveId, ...rest } = user;
    
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

    // Criar senha temporária (12 caracteres aleatórios em base64)
    const temporaryPassword = randomBytes(9).toString('base64').substring(0, 12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    // Criar usuário e membership em transação
    const newUser = await this.prisma.user.create({
      data: {
        name: dto.email.split('@')[0], // Nome padrão: parte antes do @
        email: dto.email,
        passwordHash,
        memberships: {
          create: {
            companyId: dto.companyId,
            role: dto.role,
          },
        },
      },
      select: {
        id: true,
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

    return {
      id: newUser.id,
      email: newUser.email,
      role: membership.role,
      companyId: membership.companyId,
      createdAt: newUser.createdAt,
      temporaryPassword, // Retornar a senha temporária para ser enviada ao usuário
    };
  }
}
