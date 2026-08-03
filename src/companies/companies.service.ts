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

      // Copia o conjunto padrão de permissões para a nova empresa.
      // MEMBER fica de fora de propósito: nasce com baseline vazio e recebe
      // acesso apenas pelos perfis de permissão vinculados a cada membro.
      const defaults = await tx.rolePermission.findMany({
        where: { role: { not: MembershipRole.MEMBER } },
      });
      if (defaults.length > 0) {
        await tx.companyRolePermission.createMany({
          data: defaults.map((d) => ({
            companyId: company.id,
            role: d.role,
            permissionCode: d.permissionCode,
          })),
          skipDuplicates: true,
        });
      }

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
      include: {
        establishments: {
          where: { deletedAt: null },
          select: {
            id: true,
            type: true,
            name: true,
            cnpj: true,
            inscricaoEstadual: true,
            inscricaoMunicipal: true,
            cep: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
      },
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
        throw new ConflictException(
          'Já existe um estabelecimento MATRIZ para esta empresa',
        );
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

    // Validações adicionais de negócio
    if (dto.cnpj !== undefined && dto.cnpj !== company.cnpj) {
      // Verificar se CNPJ já existe (excluindo a empresa atual)
      const existingWithCnpj = await this.prisma.company.findFirst({
        where: {
          cnpj: dto.cnpj,
          id: { not: companyId },
          deletedAt: null,
        },
      });

      if (existingWithCnpj) {
        throw new ConflictException('CNPJ já cadastrado em outra empresa');
      }
    }

    // Preparar dados para atualizar na Company
    const updateData: Partial<Record<string, unknown>> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.cnpj !== undefined) updateData.cnpj = dto.cnpj;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.taxRegime !== undefined) updateData.taxRegime = dto.taxRegime;
    if (dto.cashBlindClose !== undefined)
      updateData.cashBlindClose = dto.cashBlindClose;

    // Se establishment foi fornecido, fazer operação em transação
    if (dto.establishment !== undefined && dto.establishment !== null) {
      const estabData = dto.establishment; // Extrair para variável local
      return this.prisma.$transaction(async (tx) => {
        // Atualizar Company
        const updatedCompany = await tx.company.update({
          where: { id: companyId },
          data: updateData,
        });

        // Encontrar establishment MATRIZ
        let establishment;
        if (estabData.id) {
          // Se ID foi fornecido, validar que é MATRIZ
          establishment = await tx.establishment.findFirst({
            where: {
              id: estabData.id,
              companyId,
              type: EstablishmentType.MATRIZ,
              deletedAt: null,
            },
          });

          if (!establishment) {
            throw new NotFoundException(
              'Estabelecimento MATRIZ não encontrado ou não pertence a esta empresa',
            );
          }
        } else {
          // Se não fornecido ID, buscar o único MATRIZ existente
          establishment = await tx.establishment.findFirst({
            where: {
              companyId,
              type: EstablishmentType.MATRIZ,
              deletedAt: null,
            },
          });
        }

        if (establishment) {
          // Preparar dados do establishment
          const establishmentUpdateData: Record<string, unknown> = {};
          if (estabData.socialReason !== undefined) {
            establishmentUpdateData.name = estabData.socialReason;
          }
          if (estabData.stateRegistration !== undefined) {
            establishmentUpdateData.inscricaoEstadual =
              estabData.stateRegistration;
          }
          if (estabData.address !== undefined) {
            const addr = estabData.address;
            if (addr.cep !== undefined) establishmentUpdateData.cep = addr.cep;
            if (addr.street !== undefined)
              establishmentUpdateData.street = addr.street;
            if (addr.number !== undefined)
              establishmentUpdateData.number = addr.number;
            if (addr.complement !== undefined)
              establishmentUpdateData.complement = addr.complement;
            if (addr.neighborhood !== undefined)
              establishmentUpdateData.neighborhood = addr.neighborhood;
            if (addr.city !== undefined)
              establishmentUpdateData.city = addr.city;
            if (addr.state !== undefined)
              establishmentUpdateData.state = addr.state;
          }

          // Atualizar establishment se houver dados
          if (Object.keys(establishmentUpdateData).length > 0) {
            establishment = await tx.establishment.update({
              where: { id: establishment.id },
              data: establishmentUpdateData,
            });
          }
        }

        return {
          company: updatedCompany,
          establishment,
        };
      });
    }

    // Se stateRegistration foi fornecido, fazer operação em transação
    if (dto.stateRegistration !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        // Atualizar Company
        const updatedCompany = await tx.company.update({
          where: { id: companyId },
          data: updateData,
        });

        // Atualizar Establishment MATRIZ se existir
        const matriz = await tx.establishment.findFirst({
          where: {
            companyId,
            type: EstablishmentType.MATRIZ,
            deletedAt: null,
          },
        });

        if (matriz) {
          await tx.establishment.update({
            where: { id: matriz.id },
            data: { inscricaoEstadual: dto.stateRegistration },
          });
        }

        return updatedCompany;
      });
    }

    // Atualizar apenas Company se nenhum establishment foi fornecido
    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });
  }
}
