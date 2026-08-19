import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CashSessionStatus,
  FinancialStatus,
  FinancialType,
  FiscalDocumentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DateRange,
  businessTimezone,
  dayRange,
  eachDayKey,
  eachMonthKey,
  lastDaysRange,
  lastMonthsRange,
  monthRange,
} from '../common/utils/business-day';
import { FilterDashboardDto } from './dto/filter-dashboard.dto';
import { SalesChartDto, SalesChartRange } from './dto/sales-chart.dto';

/** Dias de antecedência com que o vencimento do certificado A1 é avisado. */
const CERTIFICATE_ALERT_DAYS = 30;
/** Quantos produtos críticos acompanham a contagem do alerta de estoque. */
const STOCK_SAMPLE_SIZE = 5;
/** Títulos que ainda podem vencer — o mesmo recorte que o módulo financeiro usa. */
const OPEN_STATUSES: FinancialStatus[] = [
  FinancialStatus.ABERTO,
  FinancialStatus.PARCIAL,
];

export interface PeriodSales {
  count: number;
  total: string;
  averageTicket: string;
}

export interface DashboardSales {
  today: PeriodSales;
  yesterday: PeriodSales;
  month: PeriodSales;
  previousMonth: PeriodSales;
  /** Orçamentos e vendas em digitação: funil, não receita. */
  openQuotes: { count: number; total: string };
}

export interface SalesChartPoint {
  /** `AAAA-MM-DD` na série diária, `AAAA-MM` na mensal. */
  key: string;
  total: string;
  count: number;
}

export interface DashboardSalesChart {
  range: SalesChartRange;
  points: SalesChartPoint[];
}

export interface FinancialBucket {
  count: number;
  total: string;
}

export interface DashboardFinancial {
  overdue: FinancialBucket;
  dueToday: FinancialBucket;
  dueNext7Days: FinancialBucket;
  open: FinancialBucket;
  /** Quanto foi efetivamente baixado no mês corrente. */
  settledThisMonth: string;
}

export interface CertificateAlert {
  establishmentId: string;
  establishmentName: string;
  expiresAt: Date;
  daysToExpire: number;
  expired: boolean;
}

export interface DashboardFiscal {
  month: {
    total: number;
    authorized: number;
    rejected: number;
    cancelled: number;
    pending: number;
    contingency: number;
    failed: number;
  };
  authorizedTotal: string;
  certificateAlerts: CertificateAlert[];
}

export interface StockAlertItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  currentStock: string;
  minStock: string | null;
}

export interface DashboardStockAlerts {
  outOfStock: number;
  belowMinimum: number;
  items: StockAlertItem[];
}

export interface OpenCashSession {
  id: string;
  cashRegisterId: string;
  cashRegisterName: string;
  operatorId: string;
  operatorName: string;
  openedAt: Date;
  openingAmount: string;
  /** Nulo quando a empresa fecha o caixa às cegas. */
  salesTotal: string | null;
}

export interface DashboardCash {
  blindClose: boolean;
  openSessions: OpenCashSession[];
  closedToday: number;
}

/** Linha crua da série de faturamento, como o Postgres a devolve. */
interface ChartRow {
  bucket: string;
  total: string | null;
  count: bigint | number;
}

function money(value: Prisma.Decimal | number | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

/** Saldo em aberto: o que falta receber ou pagar, não o valor de face. */
function outstanding(sums: {
  amount: Prisma.Decimal | null;
  paidAmount: Prisma.Decimal | null;
}): string {
  const amount = new Prisma.Decimal(sums.amount ?? 0);
  const paid = new Prisma.Decimal(sums.paidAmount ?? 0);
  return amount.minus(paid).toFixed(2);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<DashboardSales> {
    const establishmentId = await this.resolveEstablishment(companyId, filter);
    const timeZone = businessTimezone();
    const now = new Date();

    const [today, yesterday, month, previousMonth, openQuotes] =
      await Promise.all([
        this.aggregateSales(
          companyId,
          establishmentId,
          dayRange(now, timeZone),
        ),
        this.aggregateSales(
          companyId,
          establishmentId,
          dayRange(now, timeZone, -1),
        ),
        this.aggregateSales(
          companyId,
          establishmentId,
          monthRange(now, timeZone),
        ),
        this.aggregateSales(
          companyId,
          establishmentId,
          monthRange(now, timeZone, -1),
        ),
        this.prisma.sale.aggregate({
          where: {
            companyId,
            deletedAt: null,
            ...(establishmentId ? { establishmentId } : {}),
            status: { in: [SaleStatus.ORCAMENTO, SaleStatus.EM_ABERTO] },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
      ]);

    return {
      today,
      yesterday,
      month,
      previousMonth,
      openQuotes: {
        count: openQuotes._count._all,
        total: money(openQuotes._sum.totalAmount),
      },
    };
  }

  async salesChart(
    companyId: string,
    filter: SalesChartDto,
  ): Promise<DashboardSalesChart> {
    const establishmentId = await this.resolveEstablishment(companyId, filter);
    const timeZone = businessTimezone();
    const now = new Date();
    const range = filter.range ?? SalesChartRange.LAST_30_DAYS;
    const byDay = range === SalesChartRange.LAST_30_DAYS;

    const window = byDay
      ? lastDaysRange(now, timeZone, 30)
      : lastMonthsRange(now, timeZone, 12);

    const rows = await this.chartRows(
      companyId,
      establishmentId,
      window,
      timeZone,
      byDay ? 'day' : 'month',
    );

    const totals = new Map(rows.map((row) => [row.bucket, row]));
    const axis = byDay
      ? eachDayKey(window, timeZone)
      : eachMonthKey(window, timeZone);

    // O eixo manda, não o resultado da consulta: dia sem venda vira ponto zero.
    // Plotar só os dias com movimento desenharia uma reta entre datas distantes,
    // e uma queda seria lida como estabilidade.
    return {
      range,
      points: axis.map((key) => {
        const row = totals.get(key);
        return {
          key,
          total: money(row?.total === null ? null : Number(row?.total ?? 0)),
          count: Number(row?.count ?? 0),
        };
      }),
    };
  }

  receivables(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<DashboardFinancial> {
    return this.financial(companyId, filter, FinancialType.RECEBER);
  }

  payables(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<DashboardFinancial> {
    return this.financial(companyId, filter, FinancialType.PAGAR);
  }

  async fiscal(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<DashboardFiscal> {
    const establishmentId = await this.resolveEstablishment(companyId, filter);
    const timeZone = businessTimezone();
    const now = new Date();
    const month = monthRange(now, timeZone);

    const where: Prisma.FiscalDocumentWhereInput = {
      companyId,
      deletedAt: null,
      ...(establishmentId ? { establishmentId } : {}),
      createdAt: { gte: month.start, lt: month.end },
    };

    const [grouped, authorized, settings] = await Promise.all([
      this.prisma.fiscalDocument.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.fiscalDocument.aggregate({
        where: { ...where, status: FiscalDocumentStatus.AUTORIZADO },
        _sum: { valorTotal: true },
      }),
      this.prisma.fiscalSettings.findMany({
        where: {
          companyId,
          deletedAt: null,
          ativo: true,
          certificadoValidade: { not: null },
          ...(establishmentId ? { establishmentId } : {}),
        },
        select: {
          establishmentId: true,
          certificadoValidade: true,
          establishment: { select: { name: true } },
        },
      }),
    ]);

    const countOf = (...statuses: FiscalDocumentStatus[]): number =>
      grouped
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      month: {
        total: grouped.reduce((sum, row) => sum + row._count._all, 0),
        authorized: countOf(FiscalDocumentStatus.AUTORIZADO),
        rejected: countOf(FiscalDocumentStatus.REJEITADO),
        cancelled: countOf(
          FiscalDocumentStatus.CANCELADO,
          FiscalDocumentStatus.CANCELAMENTO_PENDENTE,
        ),
        pending: countOf(
          FiscalDocumentStatus.PENDENTE,
          FiscalDocumentStatus.PROCESSANDO,
        ),
        contingency: countOf(FiscalDocumentStatus.CONTINGENCIA),
        failed: countOf(FiscalDocumentStatus.ERRO),
      },
      authorizedTotal: money(authorized._sum.valorTotal),
      certificateAlerts: this.certificateAlerts(settings, now),
    };
  }

  /**
   * Produtos zerados e no limite do mínimo.
   *
   * `Product` não tem estabelecimento — o saldo é da empresa. O filtro do
   * dashboard é aceito nas outras rotas e ignorado aqui de propósito; o
   * contrato declara isso para o frontend não rotular o cartão com o nome da
   * loja.
   */
  async stockAlerts(companyId: string): Promise<DashboardStockAlerts> {
    const active: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
      isActive: true,
    };

    // Produto sem mínimo cadastrado não entra: não há parâmetro contra o qual
    // comparar, e supor um faria o sistema alarmar sozinho.
    //
    // `gt: 0` mantém os dois grupos **disjuntos**. Sem ele, o produto zerado que
    // tem mínimo cadastrado cairia nos dois, e a tela somaria "3 zerados + 7 no
    // mínimo = 10 produtos" quando são 7.
    const belowMinimumWhere: Prisma.ProductWhereInput = {
      ...active,
      minStock: { not: null },
      currentStock: {
        gt: 0,
        lte: this.prisma.product.fields.minStock,
      },
    };

    const [outOfStock, belowMinimum, items] = await Promise.all([
      this.prisma.product.count({
        where: { ...active, currentStock: { lte: 0 } },
      }),
      this.prisma.product.count({ where: belowMinimumWhere }),
      this.prisma.product.findMany({
        where: {
          ...active,
          OR: [{ currentStock: { lte: 0 } }, belowMinimumWhere],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          currentStock: true,
          minStock: true,
        },
        orderBy: { currentStock: 'asc' },
        take: STOCK_SAMPLE_SIZE,
      }),
    ]);

    return {
      outOfStock,
      belowMinimum,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        currentStock: item.currentStock.toFixed(4),
        minStock: item.minStock === null ? null : item.minStock.toFixed(4),
      })),
    };
  }

  async cash(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<DashboardCash> {
    const establishmentId = await this.resolveEstablishment(companyId, filter);
    const timeZone = businessTimezone();
    const today = dayRange(new Date(), timeZone);

    const scope = establishmentId ? { establishmentId } : {};

    const [company, sessions, closedToday] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { cashBlindClose: true },
      }),
      this.prisma.cashSession.findMany({
        where: { companyId, status: CashSessionStatus.ABERTA, ...scope },
        select: {
          id: true,
          cashRegisterId: true,
          operatorId: true,
          openedAt: true,
          openingAmount: true,
          cashRegister: { select: { name: true } },
          operator: { select: { name: true } },
        },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.cashSession.count({
        where: {
          companyId,
          status: CashSessionStatus.FECHADA,
          closedAt: { gte: today.start, lt: today.end },
          ...scope,
        },
      }),
    ]);

    // A conferência às cegas existe para o operador contar a gaveta sem saber o
    // esperado. Publicar o total da sessão aberta na home entregaria justamente
    // esse número — a regra é lida da mesma coluna, não reimplementada.
    const blindClose = company?.cashBlindClose ?? false;
    const salesTotals = blindClose
      ? new Map<string, Prisma.Decimal>()
      : await this.salesBySession(sessions.map((session) => session.id));

    return {
      blindClose,
      closedToday,
      openSessions: sessions.map((session) => ({
        id: session.id,
        cashRegisterId: session.cashRegisterId,
        cashRegisterName: session.cashRegister.name,
        operatorId: session.operatorId,
        operatorName: session.operator.name,
        openedAt: session.openedAt,
        openingAmount: money(session.openingAmount),
        salesTotal: blindClose ? null : money(salesTotals.get(session.id)),
      })),
    };
  }

  private async financial(
    companyId: string,
    filter: FilterDashboardDto,
    type: FinancialType,
  ): Promise<DashboardFinancial> {
    const establishmentId = await this.resolveEstablishment(companyId, filter);
    const timeZone = businessTimezone();
    const now = new Date();
    const today = dayRange(now, timeZone);
    const month = monthRange(now, timeZone);
    const next7Days = dayRange(now, timeZone, 7).end;

    const base: Prisma.FinancialEntryWhereInput = {
      companyId,
      deletedAt: null,
      type,
      ...(establishmentId ? { establishmentId } : {}),
    };
    const open: Prisma.FinancialEntryWhereInput = {
      ...base,
      status: { in: OPEN_STATUSES },
    };

    const [overdue, dueToday, dueNext7Days, allOpen, settled] =
      await Promise.all([
        // VENCIDO é derivado contra o agora, e não gravado: o mesmo critério do
        // módulo financeiro, para que os dois lugares nunca discordem.
        this.aggregateEntries({ ...open, dueDate: { lt: today.start } }),
        this.aggregateEntries({
          ...open,
          dueDate: { gte: today.start, lt: today.end },
        }),
        this.aggregateEntries({
          ...open,
          dueDate: { gte: today.end, lt: next7Days },
        }),
        this.aggregateEntries(open),
        this.prisma.financialPayment.aggregate({
          where: {
            entry: base,
            paidAt: { gte: month.start, lt: month.end },
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      overdue,
      dueToday,
      dueNext7Days,
      open: allOpen,
      settledThisMonth: money(settled._sum.amount),
    };
  }

  private async aggregateEntries(
    where: Prisma.FinancialEntryWhereInput,
  ): Promise<FinancialBucket> {
    const result = await this.prisma.financialEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
    });

    return {
      count: result._count._all,
      total: outstanding(result._sum),
    };
  }

  private async aggregateSales(
    companyId: string,
    establishmentId: string | undefined,
    range: DateRange,
  ): Promise<PeriodSales> {
    // Só CONCLUIDA é faturamento: orçamento é proposta, venda em digitação não
    // é receita e cancelada deixou de existir.
    const result = await this.prisma.sale.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: SaleStatus.CONCLUIDA,
        ...(establishmentId ? { establishmentId } : {}),
        saleDate: { gte: range.start, lt: range.end },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    });

    return {
      count: result._count._all,
      total: money(result._sum.totalAmount),
      averageTicket: money(result._avg.totalAmount),
    };
  }

  /**
   * Série de faturamento agrupada por dia ou mês local.
   *
   * É a única consulta em SQL cru do backend. O `groupBy` do Prisma agruparia
   * por instante exato — cada venda viraria um ponto — e trazer um ano de
   * vendas para somar em memória seria trafegar dezenas de milhares de linhas
   * para produzir doze números.
   *
   * `sale_date` é `TIMESTAMP` sem fuso guardando UTC: por isso a dupla
   * conversão. `AT TIME ZONE $tz` sozinho leria o valor como se já fosse hora
   * local e deslocaria a série em três horas — errando a virada de todo dia.
   *
   * Os ids não levam `::uuid`: o Prisma mapeia `String @id` para `TEXT`, e o
   * cast faria o Postgres recusar a comparação com `operator does not exist`.
   */
  private chartRows(
    companyId: string,
    establishmentId: string | undefined,
    range: DateRange,
    timeZone: string,
    unit: 'day' | 'month',
  ): Promise<ChartRow[]> {
    const format = unit === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const establishmentFilter = establishmentId
      ? Prisma.sql`AND s.establishment_id = ${establishmentId}`
      : Prisma.empty;

    return this.prisma.$queryRaw<ChartRow[]>`
      SELECT to_char(
               date_trunc(
                 ${unit},
                 s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}
               ),
               ${format}
             ) AS bucket,
             SUM(s.total_amount)::text AS total,
             COUNT(*)::int AS count
        FROM sales s
       WHERE s.company_id = ${companyId}
         AND s.deleted_at IS NULL
         AND s.status = ${SaleStatus.CONCLUIDA}::"SaleStatus"
         AND s.sale_date >= ${range.start}
         AND s.sale_date < ${range.end}
         ${establishmentFilter}
       GROUP BY 1
    `;
  }

  /** Total vendido em cada sessão aberta, para o cartão de caixa. */
  private async salesBySession(
    sessionIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    if (sessionIds.length === 0) return new Map();

    const grouped = await this.prisma.sale.groupBy({
      by: ['cashSessionId'],
      where: {
        cashSessionId: { in: sessionIds },
        deletedAt: null,
        status: SaleStatus.CONCLUIDA,
      },
      _sum: { totalAmount: true },
    });

    return new Map(
      grouped
        .filter((row) => row.cashSessionId !== null)
        .map((row) => [
          row.cashSessionId as string,
          row._sum.totalAmount ?? new Prisma.Decimal(0),
        ]),
    );
  }

  private certificateAlerts(
    settings: {
      establishmentId: string;
      certificadoValidade: Date | null;
      establishment: { name: string };
    }[],
    now: Date,
  ): CertificateAlert[] {
    const dayInMs = 24 * 60 * 60 * 1000;

    return settings
      .flatMap((setting) => {
        const expiresAt = setting.certificadoValidade;
        if (!expiresAt) return [];

        const daysToExpire = Math.ceil(
          (expiresAt.getTime() - now.getTime()) / dayInMs,
        );
        if (daysToExpire > CERTIFICATE_ALERT_DAYS) return [];

        return [
          {
            establishmentId: setting.establishmentId,
            establishmentName: setting.establishment.name,
            expiresAt,
            daysToExpire,
            expired: daysToExpire < 0,
          },
        ];
      })
      .sort((a, b) => a.daysToExpire - b.daysToExpire);
  }

  /**
   * Confirma que o estabelecimento pedido é da empresa ativa.
   *
   * A mensagem não distingue "não existe" de "é de outra empresa": responder
   * coisas diferentes transformaria a rota num verificador de ids alheios.
   */
  private async resolveEstablishment(
    companyId: string,
    filter: FilterDashboardDto,
  ): Promise<string | undefined> {
    if (!filter.establishmentId) return undefined;

    const establishment = await this.prisma.establishment.findFirst({
      where: { id: filter.establishmentId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!establishment) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return establishment.id;
  }
}
