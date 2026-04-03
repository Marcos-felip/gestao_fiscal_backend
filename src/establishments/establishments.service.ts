import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstablishmentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Injectable()
export class EstablishmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateEstablishmentDto) {
    if (dto.type === EstablishmentType.MATRIZ) {
      const existingMatriz = await this.prisma.establishment.findFirst({
        where: { companyId, type: EstablishmentType.MATRIZ, deletedAt: null },
      });
      if (existingMatriz) {
        throw new ConflictException('A MATRIZ establishment already exists for this company');
      }
    }

    return this.prisma.establishment.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        cnpj: dto.cnpj,
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
  }

  async findAll(companyId: string) {
    return this.prisma.establishment.findMany({
      where: { companyId, deletedAt: null },
    });
  }

  async findOne(id: string, companyId: string) {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!establishment) {
      throw new NotFoundException('Establishment not found');
    }

    return establishment;
  }

  async update(id: string, companyId: string, dto: UpdateEstablishmentDto) {
    await this.findOne(id, companyId);

    return this.prisma.establishment.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, companyId: string) {
    const establishment = await this.findOne(id, companyId);

    if (establishment.type === EstablishmentType.MATRIZ) {
      throw new BadRequestException('Cannot delete the MATRIZ establishment');
    }

    return this.prisma.establishment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
