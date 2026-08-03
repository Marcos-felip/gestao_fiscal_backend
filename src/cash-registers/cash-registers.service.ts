import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashRegister, CashSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { FilterCashRegisterDto } from './dto/filter-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';

@Injectable()
export class CashRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    dto: CreateCashRegisterDto,
  ): Promise<CashRegister> {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: dto.establishmentId, companyId, deletedAt: null },
    });

    if (!establishment) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return this.prisma.cashRegister.create({
      data: {
        companyId,
        establishmentId: dto.establishmentId,
        name: dto.name,
        isActive: dto.isActive,
      },
    });
  }

  async findAll(
    companyId: string,
    filter: FilterCashRegisterDto = {},
  ): Promise<CashRegister[]> {
    const where: Prisma.CashRegisterWhereInput = { companyId, deletedAt: null };

    if (filter.establishmentId) where.establishmentId = filter.establishmentId;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;

    return this.prisma.cashRegister.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { establishment: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, companyId: string): Promise<CashRegister> {
    const cashRegister = await this.prisma.cashRegister.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { establishment: { select: { id: true, name: true } } },
    });

    if (!cashRegister) throw new NotFoundException('Caixa não encontrado');
    return cashRegister;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateCashRegisterDto,
  ): Promise<CashRegister> {
    await this.findOne(id, companyId);

    // Desativar um terminal com turno em aberto deixaria o operador sem lugar
    // para fechar a gaveta
    if (dto.isActive === false) {
      await this.assertNoOpenSession(id, 'desativar');
    }

    return this.prisma.cashRegister.update({
      where: { id },
      data: { name: dto.name, isActive: dto.isActive },
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOne(id, companyId);
    await this.assertNoOpenSession(id, 'excluir');

    await this.prisma.cashRegister.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertNoOpenSession(
    cashRegisterId: string,
    action: string,
  ): Promise<void> {
    const open = await this.prisma.cashSession.findFirst({
      where: { cashRegisterId, status: CashSessionStatus.ABERTA },
      select: { id: true },
    });

    if (open) {
      throw new BadRequestException(
        `Não é possível ${action} um caixa com sessão aberta`,
      );
    }
  }
}
