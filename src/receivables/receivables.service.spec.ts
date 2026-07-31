import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinancialStatus, FinancialType, Prisma } from '@prisma/client';
import { ReceivablesService } from './receivables.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  financialEntry: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  financialPayment: {
    create: jest.fn(),
  },
};

const mockPrismaService = {
  $transaction: jest.fn(),
  financialEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  partner: {
    findFirst: jest.fn(),
  },
};

const dec = (value: number) => new Prisma.Decimal(value);

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  companyId: 'comp-1',
  type: FinancialType.RECEBER,
  status: FinancialStatus.ABERTO,
  amount: dec(100),
  paidAmount: dec(0),
  dueDate: new Date('2099-01-01'),
  ...overrides,
});

describe('ReceivablesService', () => {
  let service: ReceivablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceivablesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReceivablesService>(ReceivablesService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((arg) =>
      typeof arg === 'function' ? arg(mockTx) : Promise.all(arg),
    );
  });

  describe('create', () => {
    it('should split the total into installments and push the remainder to the last one', async () => {
      mockPrismaService.financialEntry.create.mockImplementation((args) =>
        Promise.resolve({ ...entry(), ...args.data }),
      );

      const result = await service.create('comp-1', {
        description: 'Serviço',
        totalAmount: 100,
        dueDate: '2026-08-10',
        installments: 3,
        intervalDays: 30,
      } as any);

      const amounts = mockPrismaService.financialEntry.create.mock.calls.map(
        (call) => (call[0] as { data: { amount: number } }).data.amount,
      );

      expect(amounts).toEqual([33.33, 33.33, 33.34]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
      expect(result).toHaveLength(3);
    });

    it('should space the due dates by intervalDays', async () => {
      mockPrismaService.financialEntry.create.mockImplementation((args) =>
        Promise.resolve({ ...entry(), ...args.data }),
      );

      await service.create('comp-1', {
        description: 'Serviço',
        totalAmount: 90,
        dueDate: '2026-08-10',
        installments: 3,
        intervalDays: 15,
      } as any);

      const dueDates = mockPrismaService.financialEntry.create.mock.calls.map(
        (call) =>
          (call[0] as { data: { dueDate: Date } }).data.dueDate
            .toISOString()
            .slice(0, 10),
      );

      expect(dueDates).toEqual(['2026-08-10', '2026-08-25', '2026-09-09']);
    });

    it('should create a single entry without the numbering suffix', async () => {
      mockPrismaService.financialEntry.create.mockImplementation((args) =>
        Promise.resolve({ ...entry(), ...args.data }),
      );

      await service.create('comp-1', {
        description: 'Serviço avulso',
        totalAmount: 50,
        dueDate: '2026-08-10',
      } as any);

      expect(mockPrismaService.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Serviço avulso',
            amount: 50,
            type: FinancialType.RECEBER,
          }),
        }),
      );
    });

    it('should throw NotFoundException if the customer does not exist', async () => {
      mockPrismaService.partner.findFirst.mockResolvedValue(null);

      await expect(
        service.create('comp-1', {
          customerId: 'part-999',
          description: 'x',
          totalAmount: 10,
          dueDate: '2026-08-10',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pay', () => {
    it('should mark the entry as PARCIAL on a partial payment', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(entry());
      mockTx.financialEntry.update.mockImplementation((args) =>
        Promise.resolve({ ...entry(), ...args.data }),
      );

      await service.pay('entry-1', 'comp-1', { amount: 40 } as any);

      expect(mockTx.financialPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entryId: 'entry-1', amount: 40 }),
        }),
      );
      expect(mockTx.financialEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidAmount: 40,
            status: FinancialStatus.PARCIAL,
          }),
        }),
      );
    });

    it('should mark the entry as PAGO when the balance is settled', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(
        entry({ paidAmount: dec(60), status: FinancialStatus.PARCIAL }),
      );
      mockTx.financialEntry.update.mockImplementation((args) =>
        Promise.resolve({ ...entry(), ...args.data }),
      );

      await service.pay('entry-1', 'comp-1', { amount: 40 } as any);

      expect(mockTx.financialEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidAmount: 100,
            status: FinancialStatus.PAGO,
          }),
        }),
      );
    });

    it('should reject a payment that exceeds the balance', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(
        entry({ paidAmount: dec(60) }),
      );

      await expect(
        service.pay('entry-1', 'comp-1', { amount: 40.01 } as any),
      ).rejects.toThrow('Valor excede o saldo do título (saldo: 40.00)');
      expect(mockTx.financialPayment.create).not.toHaveBeenCalled();
    });

    it('should reject a payment on a cancelled entry', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(
        entry({ status: FinancialStatus.CANCELADO }),
      );

      await expect(
        service.pay('entry-1', 'comp-1', { amount: 10 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockTx.financialPayment.create).not.toHaveBeenCalled();
    });

    it('should reject a payment on an already settled entry', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(
        entry({ paidAmount: dec(100), status: FinancialStatus.PAGO }),
      );

      await expect(
        service.pay('entry-1', 'comp-1', { amount: 10 } as any),
      ).rejects.toThrow('Título já quitado');
    });

    it('should throw NotFoundException if the entry does not exist', async () => {
      mockTx.financialEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.pay('entry-999', 'comp-1', { amount: 10 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should always scope to RECEBER within the active company', async () => {
      mockPrismaService.financialEntry.findMany.mockResolvedValue([]);
      mockPrismaService.financialEntry.count.mockResolvedValue(0);

      await service.findAll('comp-1', { page: 1, limit: 20 } as any);

      expect(mockPrismaService.financialEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'comp-1',
            deletedAt: null,
            type: FinancialType.RECEBER,
          }),
        }),
      );
    });

    it('should translate overdue=true into dueDate < now plus open statuses', async () => {
      mockPrismaService.financialEntry.findMany.mockResolvedValue([]);
      mockPrismaService.financialEntry.count.mockResolvedValue(0);

      await service.findAll('comp-1', { overdue: true } as any);

      const where = (
        mockPrismaService.financialEntry.findMany.mock.calls[0][0] as {
          where: { status: unknown; dueDate: { lt: Date } };
        }
      ).where;

      expect(where.status).toEqual({
        in: [FinancialStatus.ABERTO, FinancialStatus.PARCIAL],
      });
      expect(where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('should derive isOverdue on read', async () => {
      mockPrismaService.financialEntry.findMany.mockResolvedValue([
        entry({ id: 'a', dueDate: new Date('2020-01-01') }),
        entry({ id: 'b', dueDate: new Date('2099-01-01') }),
        entry({
          id: 'c',
          dueDate: new Date('2020-01-01'),
          status: FinancialStatus.PAGO,
        }),
      ]);
      mockPrismaService.financialEntry.count.mockResolvedValue(3);

      const result = await service.findAll('comp-1', {} as any);

      expect(result.data.map((e) => e.isOverdue)).toEqual([true, false, false]);
    });
  });

  describe('cancel', () => {
    it('should refuse to cancel a settled entry', async () => {
      mockPrismaService.financialEntry.findFirst.mockResolvedValue(
        entry({ status: FinancialStatus.PAGO }),
      );

      await expect(service.cancel('entry-1', 'comp-1')).rejects.toThrow(
        'Não é possível cancelar um título já quitado',
      );
      expect(mockPrismaService.financialEntry.update).not.toHaveBeenCalled();
    });

    it('should cancel an open entry', async () => {
      mockPrismaService.financialEntry.findFirst.mockResolvedValue(entry());
      mockPrismaService.financialEntry.update.mockResolvedValue(
        entry({ status: FinancialStatus.CANCELADO }),
      );

      const result = await service.cancel('entry-1', 'comp-1');

      expect(mockPrismaService.financialEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: { status: FinancialStatus.CANCELADO },
      });
      expect(result.status).toBe(FinancialStatus.CANCELADO);
    });
  });
});
