import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MembershipRole, EstablishmentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OnboardingDto } from './dto/onboarding.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCompanyDto) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name,
          type: dto.type,
          businessSegment: dto.businessSegment,
          phone: dto.phone,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId,
          companyId: company.id,
          role: MembershipRole.OWNER,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { companyActiveId: company.id },
      });

      return { company, membership };
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.company.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      include: {
        memberships: {
          where: { userId, deletedAt: null },
          select: { role: true },
        },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    if (id !== companyId) {
      throw new ForbiddenException('Acesso negado a esta empresa');
    }

    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return company;
  }

  async onboard(companyId: string, dto: OnboardingDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    if (company.isOnboarded) {
      throw new BadRequestException('Empresa já foi configurada');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingMatriz = await tx.establishment.findFirst({
        where: {
          companyId,
          type: EstablishmentType.MATRIZ,
          deletedAt: null,
        },
      });

      if (existingMatriz) {
        throw new ConflictException('Já existe um estabelecimento MATRIZ para esta empresa');
      }

      await tx.company.update({
        where: { id: companyId },
        data: {
          cnpj: dto.cnpj,
          taxRegime: dto.taxRegime,
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
      });

      await tx.establishment.create({
        data: {
          companyId,
          type: EstablishmentType.MATRIZ,
          name: dto.establishmentName,
          inscricaoEstadual: dto.inscricaoEstadual,
          inscricaoMunicipal: dto.inscricaoMunicipal,
          cep: dto.cep,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          state: dto.state,
        },
      });

      return tx.company.update({
        where: { id: companyId },
        data: { isOnboarded: true },
      });
    });
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }
}
