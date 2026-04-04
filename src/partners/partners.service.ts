import { Injectable, NotFoundException } from '@nestjs/common';
import { Partner } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    filter: FilterPartnerDto,
  ): Promise<{ data: Partner[]; total: number; page: number; limit: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      companyId,
      deletedAt: null,
    };

    if (filter.type) {
      where['type'] = filter.type;
    }

    if (filter.search) {
      where['name'] = { contains: filter.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.partner.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.partner.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Partner> {
    const partner = await this.prisma.partner.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    return partner;
  }

  async create(companyId: string, dto: CreatePartnerDto): Promise<Partner> {
    return this.prisma.partner.create({
      data: {
        companyId,
        type: dto.type,
        personType: dto.personType,
        name: dto.name,
        tradeName: dto.tradeName,
        cpfCnpj: dto.cpfCnpj,
        rgIe: dto.rgIe,
        email: dto.email,
        phone: dto.phone,
        cep: dto.cep,
        street: dto.street,
        number: dto.number,
        complement: dto.complement,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdatePartnerDto,
  ): Promise<Partner> {
    await this.findOne(id, companyId);

    return this.prisma.partner.update({
      where: { id },
      data: {
        type: dto.type,
        personType: dto.personType,
        name: dto.name,
        tradeName: dto.tradeName,
        cpfCnpj: dto.cpfCnpj,
        rgIe: dto.rgIe,
        email: dto.email,
        phone: dto.phone,
        cep: dto.cep,
        street: dto.street,
        number: dto.number,
        complement: dto.complement,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOne(id, companyId);

    await this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
