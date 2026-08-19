import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CashSessionStatus,
  FinancialStatus,
  FinancialType,
  PartnerType,
  PaymentCondition,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  sale: {
    aggregate: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  saleItem: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  salePayment: {
    createMany: jest.fn(),
  },
  financialEntry: {
    createMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  establishment: {
    findFirst: jest.fn(),
  },
  partner: {
    findFirst: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
  },
  cashSession: {
    findFirst: jest.fn(),
  },
};

const mockPrismaService = {
  $transaction: jest.fn().mockImplementation((callback) => callback(mockTx)),
  sale: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  establishment: {
    findMany: jest.fn(),
  },
  partner: {
    findMany: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
  },
};

describe('SalesService', () => {
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((callback) =>
      callback(mockTx),
    );
    // O operador tem caixa aberto por padrão: só os testes de bloqueio
    // sobrescrevem esse mock para devolver null
    mockTx.cashSession.findFirst.mockResolvedValue({ id: 'sess-1' });
  });

  describe('create', () => {
    it('should create a quote without touching the stock', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 7 } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 100,
      });
      const created = {
        id: 'sale-1',
        saleNumber: 8,
        status: SaleStatus.ORCAMENTO,
        items: [],
      };
      mockTx.sale.create.mockResolvedValue(created);

      const dto = {
        establishmentId: 'est-1',
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 25 }],
      };
      const result = await service.create('comp-1', dto as any, 'user-1');

      // A numeração ignora o soft delete: contar só as ativas reutilizaria o
      // número de uma venda excluída e violaria o índice único
      expect(mockTx.sale.aggregate).toHaveBeenCalledWith({
        where: { companyId: 'comp-1' },
        _max: { saleNumber: true },
      });
      expect(mockTx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'comp-1',
            saleNumber: 8,
            subtotal: 50,
            discount: 0,
            totalAmount: 50,
          }),
        }),
      );
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.product.update).not.toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('should subtract the discount from the total', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: null } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 100,
      });
      mockTx.sale.create.mockResolvedValue({ id: 'sale-1', items: [] });

      const dto = {
        establishmentId: 'est-1',
        discount: 10,
        items: [{ productId: 'prod-1', quantity: 4, unitPrice: 25 }],
      };
      await service.create('comp-1', dto as any, 'user-1');

      expect(mockTx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            saleNumber: 1,
            subtotal: 100,
            discount: 10,
            totalAmount: 90,
          }),
        }),
      );
    });

    it('should reject a discount greater than the subtotal', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: null } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 100,
      });

      const dto = {
        establishmentId: 'est-1',
        discount: 200,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 25 }],
      };
      await expect(
        service.create('comp-1', dto as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockTx.sale.create).not.toHaveBeenCalled();
    });

    it('should finalize in the same call when confirm is true', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 0 } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });
      mockTx.sale.create.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 1,
        paymentCondition: PaymentCondition.A_VISTA,
        items: [],
      });
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 3 },
      ]);
      mockTx.sale.update.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CONCLUIDA,
      });

      const dto = {
        establishmentId: 'est-1',
        confirm: true,
        items: [{ productId: 'prod-1', quantity: 3, unitPrice: 25 }],
        payments: [{ method: PaymentMethod.PIX, amount: 75 }],
      };
      const result = await service.create('comp-1', dto as any, 'user-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.SAIDA,
            productId: 'prod-1',
            quantity: 3,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 7 } }),
      );
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SaleStatus.CONCLUIDA,
            paymentStatus: PaymentStatus.APROVADO,
            paymentMethod: PaymentMethod.PIX,
            cashSessionId: 'sess-1',
          },
        }),
      );
      expect(result).toEqual({ id: 'sale-1', status: SaleStatus.CONCLUIDA });
    });

    it('should throw NotFoundException if establishment not found', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 0 } });
      mockTx.establishment.findFirst.mockResolvedValue(null);

      const dto = { establishmentId: 'est-999', items: [] };
      await expect(
        service.create('comp-1', dto as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('should create SAIDA movements and decrease the stock', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 12,
        status: SaleStatus.ORCAMENTO,
        paymentCondition: PaymentCondition.A_VISTA,
      });
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 4 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });
      const finalized = { id: 'sale-1', status: SaleStatus.CONCLUIDA };
      mockTx.sale.update.mockResolvedValue(finalized);

      const result = await service.confirm('sale-1', 'comp-1', 'user-1', {
        payments: [{ method: PaymentMethod.DINHEIRO, amount: 100 }],
      } as any);

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.SAIDA,
            productId: 'prod-1',
            quantity: 4,
            reason: 'Venda #12',
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 6 } }),
      );
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SaleStatus.CONCLUIDA,
            paymentStatus: PaymentStatus.APROVADO,
            paymentMethod: PaymentMethod.DINHEIRO,
            cashSessionId: 'sess-1',
          },
        }),
      );
      expect(result).toEqual(finalized);
    });

    it('should reject when the stock is insufficient', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 3,
        status: SaleStatus.EM_ABERTO,
      });
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 12 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });

      await expect(
        service.confirm('sale-1', 'comp-1', 'user-1'),
      ).rejects.toThrow('Estoque insuficiente para o produto Caneta');
      expect(mockTx.product.update).not.toHaveBeenCalled();
      expect(mockTx.sale.update).not.toHaveBeenCalled();
    });

    it('should accumulate the balance across repeated products', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 4,
        status: SaleStatus.ORCAMENTO,
      });
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 6 },
        { productId: 'prod-1', quantity: 6 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });

      await expect(
        service.confirm('sale-1', 'comp-1', 'user-1'),
      ).rejects.toThrow('Estoque insuficiente para o produto Caneta');
      expect(mockTx.product.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException if the sale is already finalized', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CONCLUIDA,
      });

      await expect(
        service.confirm('sale-1', 'comp-1', 'user-1'),
      ).rejects.toThrow('Venda já finalizada');
    });

    it('should throw NotFoundException if the sale does not exist', async () => {
      mockTx.sale.findFirst.mockResolvedValue(null);

      await expect(
        service.confirm('sale-999', 'comp-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm — desdobramento financeiro', () => {
    const prazoSale = (overrides: Record<string, unknown> = {}) => ({
      id: 'sale-1',
      saleNumber: 30,
      status: SaleStatus.EM_ABERTO,
      establishmentId: 'est-1',
      customerId: 'part-1',
      totalAmount: 100,
      paymentCondition: PaymentCondition.A_PRAZO,
      installments: 3,
      firstDueDate: new Date('2026-09-10'),
      intervalDays: 30,
      ...overrides,
    });

    beforeEach(() => {
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 1 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });
      mockTx.sale.update.mockResolvedValue({ id: 'sale-1' });
    });

    it('should not generate any entry for a cash sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue(
        prazoSale({ paymentCondition: PaymentCondition.A_VISTA }),
      );

      await service.confirm('sale-1', 'comp-1', 'user-1', {
        payments: [{ method: PaymentMethod.DINHEIRO, amount: 100 }],
      } as any);

      expect(mockTx.financialEntry.createMany).not.toHaveBeenCalled();
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SaleStatus.CONCLUIDA,
            paymentStatus: PaymentStatus.APROVADO,
            paymentMethod: PaymentMethod.DINHEIRO,
            cashSessionId: 'sess-1',
          },
        }),
      );
    });

    it('should generate one RECEBER entry per installment', async () => {
      mockTx.sale.findFirst.mockResolvedValue(prazoSale());

      await service.confirm('sale-1', 'comp-1', 'user-1');

      const rows = (
        mockTx.financialEntry.createMany.mock.calls[0][0] as {
          data: {
            amount: number;
            dueDate: Date;
            description: string;
            type: FinancialType;
            status: FinancialStatus;
            saleId: string;
            partnerId: string;
          }[];
        }
      ).data;

      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.amount)).toEqual([33.33, 33.33, 33.34]);
      expect(rows.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual([
        '2026-09-10',
        '2026-10-10',
        '2026-11-09',
      ]);
      expect(rows.map((r) => r.description)).toEqual([
        'Venda #30 (1/3)',
        'Venda #30 (2/3)',
        'Venda #30 (3/3)',
      ]);
      expect(rows.every((r) => r.type === FinancialType.RECEBER)).toBe(true);
      expect(rows.every((r) => r.status === FinancialStatus.ABERTO)).toBe(true);
      expect(rows.every((r) => r.saleId === 'sale-1')).toBe(true);
      expect(rows.every((r) => r.partnerId === 'part-1')).toBe(true);
    });

    it('should leave the payment PENDENTE on a credit sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue(prazoSale());

      await service.confirm('sale-1', 'comp-1', 'user-1');

      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SaleStatus.CONCLUIDA,
            paymentStatus: PaymentStatus.PENDENTE,
            cashSessionId: 'sess-1',
          },
        }),
      );
    });

    it('should fall back to today + intervalDays when no first due date was set', async () => {
      mockTx.sale.findFirst.mockResolvedValue(
        prazoSale({ firstDueDate: null, installments: 1, intervalDays: 15 }),
      );

      await service.confirm('sale-1', 'comp-1', 'user-1');

      const rows = (
        mockTx.financialEntry.createMany.mock.calls[0][0] as {
          data: { dueDate: Date }[];
        }
      ).data;

      const expected = new Date();
      expected.setDate(expected.getDate() + 15);
      expect(rows[0].dueDate.toISOString().slice(0, 10)).toBe(
        expected.toISOString().slice(0, 10),
      );
    });
  });

  describe('confirm — pagamentos da venda à vista', () => {
    const cashSale = (overrides: Record<string, unknown> = {}) => ({
      id: 'sale-1',
      saleNumber: 42,
      status: SaleStatus.EM_ABERTO,
      establishmentId: 'est-1',
      totalAmount: 100,
      paymentCondition: PaymentCondition.A_VISTA,
      installments: 1,
      intervalDays: 30,
      ...overrides,
    });

    const confirmWith = (payments: unknown[]) =>
      service.confirm('sale-1', 'comp-1', 'user-1', { payments } as any);

    beforeEach(() => {
      mockTx.sale.findFirst.mockResolvedValue(cashSale());
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 1 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });
      mockTx.sale.update.mockResolvedValue({ id: 'sale-1' });
    });

    it('should persist one row per payment method', async () => {
      await confirmWith([
        { method: PaymentMethod.PIX, amount: 60 },
        { method: PaymentMethod.CARTAO_DEBITO, amount: 40 },
      ]);

      expect(mockTx.salePayment.createMany).toHaveBeenCalledWith({
        data: [
          {
            companyId: 'comp-1',
            saleId: 'sale-1',
            method: PaymentMethod.PIX,
            amount: 60,
            amountReceived: null,
            changeGiven: null,
          },
          {
            companyId: 'comp-1',
            saleId: 'sale-1',
            method: PaymentMethod.CARTAO_DEBITO,
            amount: 40,
            amountReceived: null,
            changeGiven: null,
          },
        ],
      });
    });

    it('should compute the change for a cash payment', async () => {
      await confirmWith([
        { method: PaymentMethod.DINHEIRO, amount: 100, amountReceived: 150 },
      ]);

      expect(mockTx.salePayment.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            amount: 100,
            amountReceived: 150,
            changeGiven: 50,
          }),
        ],
      });
    });

    it('should reject a cash payment received below its amount', async () => {
      await expect(
        confirmWith([
          { method: PaymentMethod.DINHEIRO, amount: 100, amountReceived: 90 },
        ]),
      ).rejects.toThrow(
        'O valor recebido em dinheiro não pode ser menor que o valor do pagamento',
      );
      expect(mockTx.salePayment.createMany).not.toHaveBeenCalled();
    });

    it('should ignore amountReceived on a non-cash method', async () => {
      await confirmWith([
        { method: PaymentMethod.PIX, amount: 100, amountReceived: 150 },
      ]);

      expect(mockTx.salePayment.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ amountReceived: null, changeGiven: null }),
        ],
      });
    });

    it('should reject payments that do not add up to the total', async () => {
      await expect(
        confirmWith([{ method: PaymentMethod.PIX, amount: 90 }]),
      ).rejects.toThrow('Os pagamentos devem somar o total da venda');
    });

    it('should accept a one cent difference', async () => {
      await confirmWith([{ method: PaymentMethod.PIX, amount: 99.99 }]);

      expect(mockTx.salePayment.createMany).toHaveBeenCalled();
    });

    it('should require payments to finalize a cash sale', async () => {
      await expect(
        service.confirm('sale-1', 'comp-1', 'user-1'),
      ).rejects.toThrow(
        'Informe as formas de pagamento para finalizar uma venda à vista',
      );
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('should not touch the stock when the payments are invalid', async () => {
      await expect(
        confirmWith([{ method: PaymentMethod.PIX, amount: 50 }]),
      ).rejects.toThrow(BadRequestException);

      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.product.update).not.toHaveBeenCalled();
      expect(mockTx.sale.update).not.toHaveBeenCalled();
    });

    it('should record the largest payment as the predominant method', async () => {
      await confirmWith([
        { method: PaymentMethod.DINHEIRO, amount: 30 },
        { method: PaymentMethod.CARTAO_CREDITO, amount: 70 },
      ]);

      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: PaymentMethod.CARTAO_CREDITO,
          }),
        }),
      );
    });

    it('should ignore payments on a credit sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue(
        cashSale({ paymentCondition: PaymentCondition.A_PRAZO }),
      );

      await confirmWith([{ method: PaymentMethod.PIX, amount: 999 }]);

      expect(mockTx.salePayment.createMany).not.toHaveBeenCalled();
      expect(mockTx.financialEntry.createMany).toHaveBeenCalled();
    });
  });

  describe('confirm — vínculo com a sessão de caixa', () => {
    const cashSale = (overrides: Record<string, unknown> = {}) => ({
      id: 'sale-1',
      saleNumber: 42,
      status: SaleStatus.EM_ABERTO,
      establishmentId: 'est-1',
      totalAmount: 100,
      paymentCondition: PaymentCondition.A_VISTA,
      installments: 1,
      intervalDays: 30,
      ...overrides,
    });

    beforeEach(() => {
      mockTx.sale.findFirst.mockResolvedValue(cashSale());
      mockTx.saleItem.findMany.mockResolvedValue([
        { productId: 'prod-1', quantity: 1 },
      ]);
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 10,
      });
      mockTx.sale.update.mockResolvedValue({ id: 'sale-1' });
    });

    it('should look for the open session of the logged operator', async () => {
      await service.confirm('sale-1', 'comp-1', 'user-1', {
        payments: [{ method: PaymentMethod.PIX, amount: 100 }],
      } as any);

      expect(mockTx.cashSession.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 'comp-1',
          operatorId: 'user-1',
          status: CashSessionStatus.ABERTA,
        },
        select: { id: true },
      });
    });

    it('should block a cash sale when the operator has no open session', async () => {
      mockTx.cashSession.findFirst.mockResolvedValue(null);

      await expect(
        service.confirm('sale-1', 'comp-1', 'user-1', {
          payments: [{ method: PaymentMethod.DINHEIRO, amount: 100 }],
        } as any),
      ).rejects.toThrow('Abra um caixa para registrar vendas em dinheiro');

      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.sale.update).not.toHaveBeenCalled();
    });

    it('should finalize a credit sale without an open session', async () => {
      mockTx.cashSession.findFirst.mockResolvedValue(null);
      mockTx.sale.findFirst.mockResolvedValue(
        cashSale({
          paymentCondition: PaymentCondition.A_PRAZO,
          firstDueDate: new Date('2026-09-10'),
        }),
      );

      await service.confirm('sale-1', 'comp-1', 'user-1');

      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            cashSessionId: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should reverse the stock and refund the payment of a finalized sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 9,
        status: SaleStatus.CONCLUIDA,
        paymentStatus: PaymentStatus.APROVADO,
        items: [{ productId: 'prod-1', quantity: 4 }],
      });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        name: 'Caneta',
        currentStock: 6,
      });
      const cancelled = { id: 'sale-1', status: SaleStatus.CANCELADA };
      mockTx.sale.update.mockResolvedValue(cancelled);

      const result = await service.cancel('sale-1', 'comp-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.ENTRADA,
            productId: 'prod-1',
            quantity: 4,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 10 } }),
      );
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SaleStatus.CANCELADA,
            paymentStatus: PaymentStatus.ESTORNADO,
          },
        }),
      );
      expect(result).toEqual(cancelled);
    });

    it('should cancel a quote without stock movements', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 2,
        status: SaleStatus.ORCAMENTO,
        paymentStatus: PaymentStatus.PENDENTE,
        items: [{ productId: 'prod-1', quantity: 4 }],
      });
      mockTx.sale.update.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CANCELADA,
      });

      await service.cancel('sale-1', 'comp-1');

      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.product.update).not.toHaveBeenCalled();
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SaleStatus.CANCELADA } }),
      );
    });

    it('should throw BadRequestException if the sale is already cancelled', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CANCELADA,
        items: [],
      });

      await expect(service.cancel('sale-1', 'comp-1')).rejects.toThrow(
        'Venda já cancelada',
      );
    });

    it('should cancel the receivables of a finalized sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 30,
        status: SaleStatus.CONCLUIDA,
        paymentStatus: PaymentStatus.PENDENTE,
        items: [],
      });
      mockTx.financialEntry.findFirst.mockResolvedValue(null);
      mockTx.sale.update.mockResolvedValue({ id: 'sale-1' });

      await service.cancel('sale-1', 'comp-1');

      expect(mockTx.financialEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            saleId: 'sale-1',
            companyId: 'comp-1',
          }),
          data: { status: FinancialStatus.CANCELADO },
        }),
      );
    });

    it('should refuse to cancel a sale that already has a received installment', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 30,
        status: SaleStatus.CONCLUIDA,
        paymentStatus: PaymentStatus.PENDENTE,
        items: [{ productId: 'prod-1', quantity: 2 }],
      });
      mockTx.financialEntry.findFirst.mockResolvedValue({ id: 'entry-1' });

      await expect(service.cancel('sale-1', 'comp-1')).rejects.toThrow(
        'Venda possui parcelas recebidas; estorne o financeiro antes',
      );
      expect(mockTx.financialEntry.updateMany).not.toHaveBeenCalled();
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.sale.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should refuse to edit a finalized sale', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CONCLUIDA,
        items: [],
      });

      await expect(
        service.update('sale-1', 'comp-1', { notes: 'x' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockTx.sale.update).not.toHaveBeenCalled();
    });

    it('should replace the items and recalculate the totals', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.ORCAMENTO,
        discount: 0,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 10 }],
      });
      mockTx.product.findFirst.mockResolvedValue({
        id: 'prod-2',
        name: 'Lápis',
        currentStock: 50,
      });
      mockTx.sale.update.mockResolvedValue({ id: 'sale-1' });

      await service.update('sale-1', 'comp-1', {
        items: [{ productId: 'prod-2', quantity: 3, unitPrice: 20 }],
        discount: 5,
      } as any);

      expect(mockTx.saleItem.deleteMany).toHaveBeenCalledWith({
        where: { saleId: 'sale-1' },
      });
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal: 60,
            discount: 5,
            totalAmount: 55,
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should refuse to delete a finalized sale', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CONCLUIDA,
      });

      await expect(service.remove('sale-1', 'comp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.sale.update).not.toHaveBeenCalled();
    });

    it('should soft delete a quote', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.ORCAMENTO,
      });
      mockPrismaService.sale.update.mockResolvedValue({});

      await service.remove('sale-1', 'comp-1');

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sale-1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });
  });

  describe('getContext', () => {
    it('should scope every query to the active company and skip suppliers', async () => {
      mockPrismaService.establishment.findMany.mockResolvedValue([
        { id: 'est-1', name: 'Matriz' },
      ]);
      mockPrismaService.partner.findMany.mockResolvedValue([
        { id: 'part-1', name: 'Cliente A' },
      ]);
      mockPrismaService.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Caneta' },
      ]);

      const result = await service.getContext('comp-1');

      expect(mockPrismaService.establishment.findMany).toHaveBeenCalledWith({
        where: { companyId: 'comp-1', deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(mockPrismaService.partner.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 'comp-1',
          deletedAt: null,
          type: { not: PartnerType.SUPPLIER },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'comp-1', deletedAt: null, isActive: true },
        }),
      );
      expect(result).toEqual({
        establishments: [{ id: 'est-1', name: 'Matriz' }],
        customers: [{ id: 'part-1', name: 'Cliente A' }],
        products: [{ id: 'prod-1', name: 'Caneta' }],
      });
    });

    it('should select only the fields the PDV search needs', async () => {
      mockPrismaService.establishment.findMany.mockResolvedValue([]);
      mockPrismaService.partner.findMany.mockResolvedValue([]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      await service.getContext('comp-1');

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            unit: true,
            salePrice: true,
            currentStock: true,
          },
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should apply the status and period filters', async () => {
      mockPrismaService.sale.findMany.mockResolvedValue([]);
      mockPrismaService.sale.count.mockResolvedValue(0);

      const result = await service.findAll('comp-1', {
        page: 2,
        limit: 10,
        status: SaleStatus.CONCLUIDA,
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      } as any);

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            companyId: 'comp-1',
            deletedAt: null,
            status: SaleStatus.CONCLUIDA,
            saleDate: {
              gte: new Date('2026-07-01'),
              lte: new Date('2026-07-31'),
            },
          }),
        }),
      );
      expect(result).toEqual({ data: [], total: 0, page: 2, limit: 10 });
    });
  });
});
