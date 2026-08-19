import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  CashSessionStatus,
  FinancialStatus,
  FinancialType,
  FiscalDocumentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesChartRange } from './dto/sales-chart.dto';

const dec = (value: number) => new Prisma.Decimal(value);

const mockPrismaService = {
  sale: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  financialEntry: {
    aggregate: jest.fn(),
  },
  financialPayment: {
    aggregate: jest.fn(),
  },
  fiscalDocument: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  fiscalSettings: {
    findMany: jest.fn(),
  },
  product: {
    count: jest.fn(),
    findMany: jest.fn(),
    fields: { minStock: 'Product.minStock' },
  },
  cashSession: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
  },
  establishment: {
    findFirst: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

/** Resultado de `sale.aggregate` com contagem, soma e média. */
const salesAggregate = (count: number, total: number, average: number) => ({
  _count: { _all: count },
  _sum: { totalAmount: dec(total) },
  _avg: { totalAmount: dec(average) },
});

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  describe('sales', () => {
    beforeEach(() => {
      mockPrismaService.sale.aggregate.mockResolvedValue(
        salesAggregate(3, 300, 100),
      );
    });

    it('devolve quantidade, valor e ticket médio de cada recorte', async () => {
      const result = await service.sales('comp-1', {});

      expect(result.today).toEqual({
        count: 3,
        total: '300.00',
        averageTicket: '100.00',
      });
      expect(result.month.total).toBe('300.00');
    });

    it('conta apenas vendas concluídas e não excluídas no faturamento', async () => {
      await service.sales('comp-1', {});

      const faturamento = mockPrismaService.sale.aggregate.mock.calls
        .map(([args]: [{ where: Record<string, unknown> }]) => args.where)
        .filter((where) => where.status === SaleStatus.CONCLUIDA);

      expect(faturamento).toHaveLength(4);
      faturamento.forEach((where) => {
        expect(where.companyId).toBe('comp-1');
        expect(where.deletedAt).toBeNull();
      });
    });

    it('separa orçamento e venda em digitação do faturamento', async () => {
      await service.sales('comp-1', {});

      const funil = mockPrismaService.sale.aggregate.mock.calls
        .map(([args]: [{ where: Record<string, unknown> }]) => args.where)
        .find((where) => where.status !== SaleStatus.CONCLUIDA);

      expect(funil?.status).toEqual({
        in: [SaleStatus.ORCAMENTO, SaleStatus.EM_ABERTO],
      });
      expect(funil?.saleDate).toBeUndefined();
    });

    it('devolve zero, e não erro, no dia sem venda', async () => {
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalAmount: null },
        _avg: { totalAmount: null },
      });

      const result = await service.sales('comp-1', {});

      expect(result.today).toEqual({
        count: 0,
        total: '0.00',
        averageTicket: '0.00',
      });
    });

    it('aplica o estabelecimento quando ele é da empresa ativa', async () => {
      mockPrismaService.establishment.findFirst.mockResolvedValue({
        id: 'est-1',
      });

      await service.sales('comp-1', { establishmentId: 'est-1' });

      mockPrismaService.sale.aggregate.mock.calls.forEach(
        ([args]: [{ where: Record<string, unknown> }]) => {
          expect(args.where.establishmentId).toBe('est-1');
        },
      );
    });

    it('recusa estabelecimento de outra empresa sem consultar indicador', async () => {
      mockPrismaService.establishment.findFirst.mockResolvedValue(null);

      await expect(
        service.sales('comp-1', { establishmentId: 'est-alheio' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrismaService.sale.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('salesChart', () => {
    it('preenche com zero os dias sem venda', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.salesChart('comp-1', {
        range: SalesChartRange.LAST_30_DAYS,
      });

      expect(result.points).toHaveLength(30);
      expect(result.points.every((point) => point.total === '0.00')).toBe(true);
      expect(result.points.every((point) => point.count === 0)).toBe(true);
    });

    it('projeta os totais do banco sobre o eixo, mantendo os buracos', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      const eixo = (await service.salesChart('comp-1', {})).points.map(
        (point) => point.key,
      );

      mockPrismaService.$queryRaw.mockResolvedValue([
        { bucket: eixo[0], total: '150.5', count: 2 },
        { bucket: eixo[29], total: '80', count: 1 },
      ]);

      const result = await service.salesChart('comp-1', {});

      expect(result.points[0]).toEqual({
        key: eixo[0],
        total: '150.50',
        count: 2,
      });
      expect(result.points[1].total).toBe('0.00');
      expect(result.points[29].total).toBe('80.00');
    });

    it('devolve doze pontos na série mensal', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.salesChart('comp-1', {
        range: SalesChartRange.LAST_12_MONTHS,
      });

      expect(result.range).toBe(SalesChartRange.LAST_12_MONTHS);
      expect(result.points).toHaveLength(12);
      expect(result.points[0].key).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('receivables e payables', () => {
    beforeEach(() => {
      mockPrismaService.financialEntry.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { amount: dec(500), paidAmount: dec(100) },
      });
      mockPrismaService.financialPayment.aggregate.mockResolvedValue({
        _sum: { amount: dec(1200) },
      });
    });

    it('pesa o saldo em aberto, não o valor de face', async () => {
      const result = await service.receivables('comp-1', {});

      expect(result.open.total).toBe('400.00');
      expect(result.overdue.total).toBe('400.00');
    });

    it('deriva o vencido contra o agora, só em título ainda em aberto', async () => {
      await service.receivables('comp-1', {});

      const [vencido] = mockPrismaService.financialEntry.aggregate.mock
        .calls[0] as [{ where: Record<string, unknown> }];

      expect(vencido.where.status).toEqual({
        in: [FinancialStatus.ABERTO, FinancialStatus.PARCIAL],
      });
      expect(vencido.where.dueDate).toHaveProperty('lt');
      expect(vencido.where.type).toBe(FinancialType.RECEBER);
    });

    it('consulta o contas a pagar com o tipo próprio', async () => {
      await service.payables('comp-1', {});

      const [primeiro] = mockPrismaService.financialEntry.aggregate.mock
        .calls[0] as [{ where: Record<string, unknown> }];

      expect(primeiro.where.type).toBe(FinancialType.PAGAR);
    });

    it('soma no mês apenas as baixas efetivamente registradas', async () => {
      const result = await service.receivables('comp-1', {});

      expect(result.settledThisMonth).toBe('1200.00');
      const [args] = mockPrismaService.financialPayment.aggregate.mock
        .calls[0] as [{ where: Record<string, unknown> }];
      expect(args.where.paidAt).toHaveProperty('gte');
    });
  });

  describe('fiscal', () => {
    beforeEach(() => {
      mockPrismaService.fiscalDocument.aggregate.mockResolvedValue({
        _sum: { valorTotal: dec(2500) },
      });
      mockPrismaService.fiscalSettings.findMany.mockResolvedValue([]);
    });

    it('agrupa as situações do mês e soma só o autorizado', async () => {
      mockPrismaService.fiscalDocument.groupBy.mockResolvedValue([
        { status: FiscalDocumentStatus.AUTORIZADO, _count: { _all: 10 } },
        { status: FiscalDocumentStatus.REJEITADO, _count: { _all: 2 } },
        { status: FiscalDocumentStatus.PENDENTE, _count: { _all: 1 } },
        { status: FiscalDocumentStatus.PROCESSANDO, _count: { _all: 1 } },
      ]);

      const result = await service.fiscal('comp-1', {});

      expect(result.month.total).toBe(14);
      expect(result.month.authorized).toBe(10);
      expect(result.month.rejected).toBe(2);
      expect(result.month.pending).toBe(2);
      expect(result.authorizedTotal).toBe('2500.00');
    });

    it('responde zerado para empresa que ainda não emite', async () => {
      mockPrismaService.fiscalDocument.groupBy.mockResolvedValue([]);
      mockPrismaService.fiscalDocument.aggregate.mockResolvedValue({
        _sum: { valorTotal: null },
      });

      const result = await service.fiscal('comp-1', {});

      expect(result.month.total).toBe(0);
      expect(result.authorizedTotal).toBe('0.00');
      expect(result.certificateAlerts).toEqual([]);
    });

    it('avisa o certificado que vence dentro de 30 dias', async () => {
      const emVinteDias = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      mockPrismaService.fiscalDocument.groupBy.mockResolvedValue([]);
      mockPrismaService.fiscalSettings.findMany.mockResolvedValue([
        {
          establishmentId: 'est-1',
          certificadoValidade: emVinteDias,
          establishment: { name: 'Matriz' },
        },
      ]);

      const result = await service.fiscal('comp-1', {});

      expect(result.certificateAlerts).toHaveLength(1);
      expect(result.certificateAlerts[0].establishmentName).toBe('Matriz');
      expect(result.certificateAlerts[0].daysToExpire).toBeLessThanOrEqual(20);
      expect(result.certificateAlerts[0].expired).toBe(false);
    });

    it('não avisa certificado com validade folgada', async () => {
      const emUmAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockPrismaService.fiscalDocument.groupBy.mockResolvedValue([]);
      mockPrismaService.fiscalSettings.findMany.mockResolvedValue([
        {
          establishmentId: 'est-1',
          certificadoValidade: emUmAno,
          establishment: { name: 'Matriz' },
        },
      ]);

      const result = await service.fiscal('comp-1', {});

      expect(result.certificateAlerts).toEqual([]);
    });

    it('marca como vencido o certificado que já passou da validade', async () => {
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrismaService.fiscalDocument.groupBy.mockResolvedValue([]);
      mockPrismaService.fiscalSettings.findMany.mockResolvedValue([
        {
          establishmentId: 'est-1',
          certificadoValidade: ontem,
          establishment: { name: 'Matriz' },
        },
      ]);

      const result = await service.fiscal('comp-1', {});

      expect(result.certificateAlerts[0].expired).toBe(true);
    });
  });

  describe('stockAlerts', () => {
    beforeEach(() => {
      mockPrismaService.product.count.mockResolvedValue(4);
      mockPrismaService.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Refrigerante Lata 350ml',
          sku: 'REF-350',
          unit: 'UN',
          currentStock: dec(0),
          minStock: dec(10),
        },
      ]);
    });

    it('conta zerados e abaixo do mínimo, com amostra dos mais críticos', async () => {
      const result = await service.stockAlerts('comp-1');

      expect(result.outOfStock).toBe(4);
      expect(result.belowMinimum).toBe(4);
      expect(result.items[0].name).toBe('Refrigerante Lata 350ml');
      expect(result.items[0].currentStock).toBe('0.0000');
    });

    it('deixa fora do alerta de mínimo o produto sem mínimo cadastrado', async () => {
      await service.stockAlerts('comp-1');

      const [, minimo] = mockPrismaService.product.count.mock.calls as [
        { where: Record<string, unknown> },
      ][];

      expect(minimo[0].where.minStock).toEqual({ not: null });
      // `gt: 0` mantém zerados e "no mínimo" disjuntos: sem ele o produto
      // zerado com mínimo cadastrado seria contado duas vezes na tela.
      expect(minimo[0].where.currentStock).toMatchObject({ gt: 0 });
      expect(minimo[0].where.isActive).toBe(true);
      expect(minimo[0].where.deletedAt).toBeNull();
    });

    it('devolve nulo no mínimo do produto que só está zerado', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([
        {
          id: 'prod-2',
          name: 'Caneta azul',
          sku: null,
          unit: 'UN',
          currentStock: dec(0),
          minStock: null,
        },
      ]);

      const result = await service.stockAlerts('comp-1');

      expect(result.items[0].minStock).toBeNull();
    });
  });

  describe('cash', () => {
    const sessao = {
      id: 'sess-1',
      cashRegisterId: 'reg-1',
      operatorId: 'user-1',
      openedAt: new Date('2026-08-19T11:00:00Z'),
      openingAmount: dec(200),
      cashRegister: { name: 'Caixa 1' },
      operator: { name: 'Ana' },
    };

    beforeEach(() => {
      mockPrismaService.cashSession.findMany.mockResolvedValue([sessao]);
      mockPrismaService.cashSession.count.mockResolvedValue(2);
      mockPrismaService.sale.groupBy.mockResolvedValue([
        { cashSessionId: 'sess-1', _sum: { totalAmount: dec(1450) } },
      ]);
    });

    it('lista o caixa aberto com operador e horário', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue({
        cashBlindClose: false,
      });

      const result = await service.cash('comp-1', {});

      expect(result.openSessions).toHaveLength(1);
      expect(result.openSessions[0].cashRegisterName).toBe('Caixa 1');
      expect(result.openSessions[0].operatorName).toBe('Ana');
      expect(result.openSessions[0].openingAmount).toBe('200.00');
      expect(result.closedToday).toBe(2);
    });

    it('revela o total da sessão quando a empresa não fecha às cegas', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue({
        cashBlindClose: false,
      });

      const result = await service.cash('comp-1', {});

      expect(result.blindClose).toBe(false);
      expect(result.openSessions[0].salesTotal).toBe('1450.00');
    });

    it('esconde o total da sessão aberta no fechamento às cegas', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue({
        cashBlindClose: true,
      });

      const result = await service.cash('comp-1', {});

      expect(result.blindClose).toBe(true);
      expect(result.openSessions[0].salesTotal).toBeNull();
      // Nem chega a somar: o número não pode existir na resposta.
      expect(mockPrismaService.sale.groupBy).not.toHaveBeenCalled();
    });

    it('conta apenas as sessões fechadas hoje', async () => {
      mockPrismaService.company.findUnique.mockResolvedValue({
        cashBlindClose: false,
      });

      await service.cash('comp-1', {});

      const [args] = mockPrismaService.cashSession.count.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      expect(args.where.status).toBe(CashSessionStatus.FECHADA);
      expect(args.where.closedAt).toHaveProperty('gte');
      expect(args.where.closedAt).toHaveProperty('lt');
    });
  });
});
