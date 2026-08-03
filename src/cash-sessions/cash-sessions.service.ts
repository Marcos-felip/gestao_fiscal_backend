import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovement,
  CashMovementType,
  CashSession,
  CashSessionStatus,
  FinancialStatus,
  FinancialType,
  PaymentMethod,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { FilterCashSessionDto } from './dto/filter-cash-session.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';

/**
 * Resumo financeiro da sessão.
 *
 * Os campos anuláveis são os que o fechamento às cegas esconde enquanto o turno
 * está aberto — ver `blind`.
 */
export interface CashSessionSummary {
  openingAmount: number;
  cashSales: number | null;
  supplies: number;
  withdrawals: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  salesCount: number;
  salesTotal: number | null;
  paymentBreakdown: { method: PaymentMethod; amount: number }[] | null;
  creditTotal: number | null;
  blind: boolean;
}

export type CashSessionWithSummary = CashSession & {
  summary: CashSessionSummary;
};

/** Diferença de caixa ignorada na exigência de justificativa */
const DIFFERENCE_TOLERANCE = 0.01;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    companyId: string,
    operatorId: string,
    dto: OpenCashSessionDto,
  ): Promise<CashSessionWithSummary> {
    const cashRegister = await this.prisma.cashRegister.findFirst({
      where: { id: dto.cashRegisterId, companyId, deletedAt: null },
    });

    if (!cashRegister) throw new NotFoundException('Caixa não encontrado');

    if (!cashRegister.isActive) {
      throw new BadRequestException('Este caixa está inativo');
    }

    const registerBusy = await this.prisma.cashSession.findFirst({
      where: {
        cashRegisterId: dto.cashRegisterId,
        status: CashSessionStatus.ABERTA,
      },
      select: { id: true },
    });

    if (registerBusy) {
      throw new BadRequestException('Este caixa já tem uma sessão aberta');
    }

    // Um operador em dois caixas ao mesmo tempo tornaria ambíguo em qual gaveta
    // a venda dele entra
    const operatorBusy = await this.prisma.cashSession.findFirst({
      where: { operatorId, companyId, status: CashSessionStatus.ABERTA },
      select: { id: true },
    });

    if (operatorBusy) {
      throw new BadRequestException('Você já tem um caixa aberto');
    }

    const session = await this.prisma.cashSession.create({
      data: {
        companyId,
        establishmentId: cashRegister.establishmentId,
        cashRegisterId: cashRegister.id,
        operatorId,
        openingAmount: dto.openingAmount,
      },
      include: { cashRegister: { select: { id: true, name: true } } },
    });

    return this.withSummary(companyId, session);
  }

  /**
   * Sessão aberta do operador logado — é o gatilho que o PDV consulta para
   * saber se pode vender.
   */
  async current(
    companyId: string,
    operatorId: string,
  ): Promise<CashSessionWithSummary | null> {
    const session = await this.prisma.cashSession.findFirst({
      where: { companyId, operatorId, status: CashSessionStatus.ABERTA },
      include: {
        cashRegister: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) return null;

    return this.withSummary(companyId, session);
  }

  async findAll(
    companyId: string,
    filter: FilterCashSessionDto,
  ): Promise<{
    data: CashSession[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CashSessionWhereInput = { companyId };

    if (filter.status) where.status = filter.status;
    if (filter.cashRegisterId) where.cashRegisterId = filter.cashRegisterId;

    const openedAt: Prisma.DateTimeFilter = {};
    if (filter.startDate) openedAt.gte = new Date(filter.startDate);
    if (filter.endDate) openedAt.lte = new Date(filter.endDate);
    if (Object.keys(openedAt).length > 0) where.openedAt = openedAt;

    const [data, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          cashRegister: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.cashSession.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    companyId: string,
  ): Promise<CashSessionWithSummary> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, companyId },
      include: {
        cashRegister: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');

    return this.withSummary(companyId, session);
  }

  async addMovement(
    id: string,
    companyId: string,
    userId: string,
    dto: CreateCashMovementDto,
  ): Promise<CashMovement> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });

    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');

    if (session.status !== CashSessionStatus.ABERTA) {
      throw new BadRequestException(
        'Não é possível movimentar uma sessão fechada',
      );
    }

    return this.prisma.cashMovement.create({
      data: {
        companyId,
        sessionId: session.id,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason,
        createdById: userId,
      },
    });
  }

  async close(
    id: string,
    companyId: string,
    dto: CloseCashSessionDto,
  ): Promise<CashSessionWithSummary> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, companyId },
    });

    if (!session) throw new NotFoundException('Sessão de caixa não encontrada');

    if (session.status === CashSessionStatus.FECHADA) {
      throw new BadRequestException('Esta sessão já está fechada');
    }

    const totals = await this.calculate(companyId, session);
    const countedCash = round2(dto.countedCash);
    const difference = round2(countedCash - totals.expectedCash);

    // O caixa fecha sempre: quebra é fato a registrar, não motivo para travar o
    // turno. O que se exige é a justificativa.
    if (Math.abs(difference) > DIFFERENCE_TOLERANCE && !dto.notes?.trim()) {
      throw new BadRequestException(
        'Informe uma observação para a diferença de caixa',
      );
    }

    const closed = await this.prisma.cashSession.update({
      where: { id },
      data: {
        status: CashSessionStatus.FECHADA,
        closedAt: new Date(),
        expectedCash: totals.expectedCash,
        countedCash,
        difference,
        closingNotes: dto.notes,
      },
      include: {
        cashRegister: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });

    return this.withSummary(companyId, closed);
  }

  /**
   * Números da sessão. A conferência é **só de dinheiro**: cartão e PIX entram
   * no breakdown como informação, mas não afetam o esperado em gaveta — esse
   * dinheiro nunca passou por ela.
   */
  private async calculate(
    companyId: string,
    session: CashSession,
  ): Promise<{
    openingAmount: number;
    cashSales: number;
    supplies: number;
    withdrawals: number;
    expectedCash: number;
    salesCount: number;
    salesTotal: number;
    paymentBreakdown: { method: PaymentMethod; amount: number }[];
    creditTotal: number;
  }> {
    const soldInSession = {
      cashSessionId: session.id,
      status: SaleStatus.CONCLUIDA,
      deletedAt: null,
    };

    const [payments, movements, sales, credit] = await Promise.all([
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { companyId, sale: soldInSession },
        _sum: { amount: true },
      }),
      this.prisma.cashMovement.groupBy({
        by: ['type'],
        where: { sessionId: session.id },
        _sum: { amount: true },
      }),
      this.prisma.sale.aggregate({
        where: { companyId, ...soldInSession },
        _count: true,
        _sum: { totalAmount: true },
      }),
      // Vendas a prazo da sessão não entram na gaveta: viram título a receber
      this.prisma.financialEntry.aggregate({
        where: {
          companyId,
          deletedAt: null,
          type: FinancialType.RECEBER,
          status: { not: FinancialStatus.CANCELADO },
          sale: soldInSession,
        },
        _sum: { amount: true },
      }),
    ]);

    const paymentBreakdown = payments
      .map((row) => ({ method: row.method, amount: toNumber(row._sum.amount) }))
      .sort((a, b) => b.amount - a.amount);

    const cashSales = round2(
      paymentBreakdown.find((row) => row.method === PaymentMethod.DINHEIRO)
        ?.amount ?? 0,
    );

    const sumOf = (type: CashMovementType) =>
      round2(
        toNumber(
          movements.find((row) => row.type === type)?._sum.amount ?? null,
        ),
      );

    const supplies = sumOf(CashMovementType.SUPRIMENTO);
    const withdrawals = sumOf(CashMovementType.SANGRIA);
    const openingAmount = round2(Number(session.openingAmount));

    return {
      openingAmount,
      cashSales,
      supplies,
      withdrawals,
      expectedCash: round2(openingAmount + cashSales + supplies - withdrawals),
      salesCount: sales._count,
      salesTotal: round2(toNumber(sales._sum.totalAmount)),
      paymentBreakdown,
      creditTotal: round2(toNumber(credit._sum.amount)),
    };
  }

  /**
   * Monta o resumo respeitando o fechamento às cegas.
   *
   * Com `cashBlindClose` ligado e a sessão ainda aberta, tudo que permitiria
   * deduzir o esperado em gaveta volta como `null` — mostrar só parte dos
   * números daria uma cegueira falsa, já que o operador somaria o resto.
   * Depois do fechamento a sessão devolve tudo.
   */
  private async withSummary<T extends CashSession>(
    companyId: string,
    session: T,
  ): Promise<T & { summary: CashSessionSummary }> {
    const totals = await this.calculate(companyId, session);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { cashBlindClose: true },
    });

    const blind =
      (company?.cashBlindClose ?? false) &&
      session.status === CashSessionStatus.ABERTA;

    return {
      ...session,
      summary: {
        openingAmount: totals.openingAmount,
        supplies: totals.supplies,
        withdrawals: totals.withdrawals,
        salesCount: totals.salesCount,
        countedCash:
          session.countedCash === null ? null : Number(session.countedCash),
        difference:
          session.difference === null ? null : Number(session.difference),
        cashSales: blind ? null : totals.cashSales,
        expectedCash: blind ? null : totals.expectedCash,
        salesTotal: blind ? null : totals.salesTotal,
        paymentBreakdown: blind ? null : totals.paymentBreakdown,
        creditTotal: blind ? null : totals.creditTotal,
        blind,
      },
    };
  }
}
