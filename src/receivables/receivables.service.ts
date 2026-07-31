import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialEntry,
  FinancialStatus,
  FinancialType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_INTERVAL_DAYS,
  buildInstallments,
} from '../common/utils/installments';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { FilterReceivableDto } from './dto/filter-receivable.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';

export type Receivable = FinancialEntry & { isOverdue: boolean };

/** Status em que um título ainda pode vencer */
const OPEN_STATUSES: FinancialStatus[] = [
  FinancialStatus.ABERTO,
  FinancialStatus.PARCIAL,
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * VENCIDO é derivado na leitura, não gravado.
 *
 * Guardar o status exigiria um job diário e deixaria a tabela mentindo entre
 * uma execução e outra. Aqui o vencimento é sempre calculado contra o agora.
 */
function withOverdue<T extends FinancialEntry>(
  entry: T,
): T & { isOverdue: boolean } {
  return {
    ...entry,
    isOverdue:
      OPEN_STATUSES.includes(entry.status) && entry.dueDate < new Date(),
  };
}

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    dto: CreateReceivableDto,
  ): Promise<Receivable[]> {
    if (dto.customerId) {
      const customer = await this.prisma.partner.findFirst({
        where: { id: dto.customerId, companyId, deletedAt: null },
      });

      if (!customer) {
        throw new NotFoundException('Cliente não encontrado');
      }
    }

    const total = dto.installments ?? 1;
    const installments = buildInstallments(
      dto.totalAmount,
      total,
      new Date(dto.dueDate),
      dto.intervalDays ?? DEFAULT_INTERVAL_DAYS,
    );

    const created = await this.prisma.$transaction(
      installments.map((installment) =>
        this.prisma.financialEntry.create({
          data: {
            companyId,
            type: FinancialType.RECEBER,
            status: FinancialStatus.ABERTO,
            partnerId: dto.customerId,
            category: dto.category,
            description:
              total > 1
                ? `${dto.description} (${installment.installmentNumber}/${installment.installmentTotal})`
                : dto.description,
            amount: installment.amount,
            dueDate: installment.dueDate,
            installmentNumber: installment.installmentNumber,
            installmentTotal: installment.installmentTotal,
          },
        }),
      ),
    );

    return created.map(withOverdue);
  }

  async findAll(
    companyId: string,
    filter: FilterReceivableDto,
  ): Promise<{
    data: Receivable[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FinancialEntryWhereInput = {
      companyId,
      deletedAt: null,
      type: FinancialType.RECEBER,
    };

    if (filter.status) where.status = filter.status;
    if (filter.customerId) where.partnerId = filter.customerId;
    if (filter.saleId) where.saleId = filter.saleId;

    const dueDate: Prisma.DateTimeFilter = {};
    if (filter.startDate) dueDate.gte = new Date(filter.startDate);
    if (filter.endDate) dueDate.lte = new Date(filter.endDate);

    // Mesmo critério do isOverdue, aplicado no banco para a paginação bater
    if (filter.overdue) {
      dueDate.lt = new Date();
      where.status = filter.status ?? { in: OPEN_STATUSES };
    }

    if (Object.keys(dueDate).length > 0) {
      where.dueDate = dueDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          partner: { select: { id: true, name: true } },
          sale: { select: { id: true, saleNumber: true } },
        },
      }),
      this.prisma.financialEntry.count({ where }),
    ]);

    return { data: data.map(withOverdue), total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Receivable> {
    const entry = await this.prisma.financialEntry.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
        type: FinancialType.RECEBER,
      },
      include: {
        partner: { select: { id: true, name: true } },
        sale: { select: { id: true, saleNumber: true } },
        payments: { orderBy: { paidAt: 'asc' } },
      },
    });

    if (!entry) throw new NotFoundException('Conta a receber não encontrada');

    return withOverdue(entry);
  }

  async pay(
    id: string,
    companyId: string,
    dto: PayReceivableDto,
  ): Promise<Receivable> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.financialEntry.findFirst({
        where: {
          id,
          companyId,
          deletedAt: null,
          type: FinancialType.RECEBER,
        },
      });

      if (!entry) throw new NotFoundException('Conta a receber não encontrada');

      if (entry.status === FinancialStatus.CANCELADO) {
        throw new BadRequestException(
          'Não é possível baixar um título cancelado',
        );
      }

      const amount = round2(entry.amount.toNumber());
      const alreadyPaid = round2(entry.paidAmount.toNumber());
      const balance = round2(amount - alreadyPaid);

      if (balance <= 0) {
        throw new BadRequestException('Título já quitado');
      }

      const payment = round2(dto.amount);

      if (payment > balance) {
        throw new BadRequestException(
          `Valor excede o saldo do título (saldo: ${balance.toFixed(2)})`,
        );
      }

      await tx.financialPayment.create({
        data: {
          entryId: entry.id,
          amount: payment,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          method: dto.method,
          notes: dto.notes,
        },
      });

      const paidAmount = round2(alreadyPaid + payment);

      const updated = await tx.financialEntry.update({
        where: { id: entry.id },
        data: {
          paidAmount,
          status:
            paidAmount >= amount
              ? FinancialStatus.PAGO
              : FinancialStatus.PARCIAL,
        },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      });

      return withOverdue(updated);
    });
  }

  async cancel(id: string, companyId: string): Promise<Receivable> {
    const entry = await this.findOne(id, companyId);

    if (entry.status === FinancialStatus.CANCELADO) {
      throw new BadRequestException('Título já cancelado');
    }

    if (entry.status === FinancialStatus.PAGO) {
      throw new BadRequestException(
        'Não é possível cancelar um título já quitado',
      );
    }

    const updated = await this.prisma.financialEntry.update({
      where: { id },
      data: { status: FinancialStatus.CANCELADO },
    });

    return withOverdue(updated);
  }
}
