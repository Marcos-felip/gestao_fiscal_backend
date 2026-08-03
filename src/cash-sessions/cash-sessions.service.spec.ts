import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
} from '@prisma/client';
import { CashSessionsService } from './cash-sessions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  cashRegister: {
    findFirst: jest.fn(),
  },
  cashSession: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  cashMovement: {
    create: jest.fn(),
    groupBy: jest.fn(),
  },
  salePayment: {
    groupBy: jest.fn(),
  },
  sale: {
    aggregate: jest.fn(),
  },
  financialEntry: {
    aggregate: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
  },
};

const openSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-1',
  companyId: 'comp-1',
  cashRegisterId: 'reg-1',
  operatorId: 'user-1',
  status: CashSessionStatus.ABERTA,
  openingAmount: 100,
  countedCash: null,
  difference: null,
  ...overrides,
});

describe('CashSessionsService', () => {
  let service: CashSessionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashSessionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CashSessionsService>(CashSessionsService);
    jest.clearAllMocks();

    // Sessão sem movimento: cada teste sobrescreve o que precisa
    mockPrismaService.salePayment.groupBy.mockResolvedValue([]);
    mockPrismaService.cashMovement.groupBy.mockResolvedValue([]);
    mockPrismaService.sale.aggregate.mockResolvedValue({
      _count: 0,
      _sum: { totalAmount: null },
    });
    mockPrismaService.financialEntry.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    mockPrismaService.company.findUnique.mockResolvedValue({
      cashBlindClose: false,
    });
  });

  describe('open', () => {
    it('should open a session with the float amount', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        establishmentId: 'est-1',
        isActive: true,
      });
      mockPrismaService.cashSession.findFirst.mockResolvedValue(null);
      mockPrismaService.cashSession.create.mockResolvedValue(openSession());

      const result = await service.open('comp-1', 'user-1', {
        cashRegisterId: 'reg-1',
        openingAmount: 100,
      });

      expect(mockPrismaService.cashSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            companyId: 'comp-1',
            establishmentId: 'est-1',
            cashRegisterId: 'reg-1',
            operatorId: 'user-1',
            openingAmount: 100,
          },
        }),
      );
      expect(result.summary.openingAmount).toBe(100);
      expect(result.summary.expectedCash).toBe(100);
    });

    it('should reject an inactive cash register', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        establishmentId: 'est-1',
        isActive: false,
      });

      await expect(
        service.open('comp-1', 'user-1', {
          cashRegisterId: 'reg-1',
          openingAmount: 100,
        }),
      ).rejects.toThrow('Este caixa está inativo');
    });

    it('should reject a cash register that already has an open session', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        establishmentId: 'est-1',
        isActive: true,
      });
      mockPrismaService.cashSession.findFirst.mockResolvedValueOnce({
        id: 'sess-9',
      });

      await expect(
        service.open('comp-1', 'user-1', {
          cashRegisterId: 'reg-1',
          openingAmount: 100,
        }),
      ).rejects.toThrow('Este caixa já tem uma sessão aberta');
      expect(mockPrismaService.cashSession.create).not.toHaveBeenCalled();
    });

    it('should reject an operator that already has an open session elsewhere', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
        establishmentId: 'est-1',
        isActive: true,
      });
      mockPrismaService.cashSession.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sess-8' });

      await expect(
        service.open('comp-1', 'user-1', {
          cashRegisterId: 'reg-1',
          openingAmount: 100,
        }),
      ).rejects.toThrow('Você já tem um caixa aberto');
      expect(mockPrismaService.cashSession.create).not.toHaveBeenCalled();
    });

    it('should reject a cash register from another company', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue(null);

      await expect(
        service.open('comp-1', 'user-1', {
          cashRegisterId: 'reg-outra',
          openingAmount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('current', () => {
    it('should return null when the operator has no open session', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue(null);

      await expect(service.current('comp-1', 'user-1')).resolves.toBeNull();
    });
  });

  describe('addMovement', () => {
    it('should record a withdrawal', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        status: CashSessionStatus.ABERTA,
      });
      mockPrismaService.cashMovement.create.mockResolvedValue({ id: 'mov-1' });

      await service.addMovement('sess-1', 'comp-1', 'user-1', {
        type: CashMovementType.SANGRIA,
        amount: 50,
        reason: 'Depósito bancário',
      });

      expect(mockPrismaService.cashMovement.create).toHaveBeenCalledWith({
        data: {
          companyId: 'comp-1',
          sessionId: 'sess-1',
          type: CashMovementType.SANGRIA,
          amount: 50,
          reason: 'Depósito bancário',
          createdById: 'user-1',
        },
      });
    });

    it('should block a movement on a closed session', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        status: CashSessionStatus.FECHADA,
      });

      await expect(
        service.addMovement('sess-1', 'comp-1', 'user-1', {
          type: CashMovementType.SUPRIMENTO,
          amount: 50,
        }),
      ).rejects.toThrow('Não é possível movimentar uma sessão fechada');
      expect(mockPrismaService.cashMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue(openSession());
      mockPrismaService.salePayment.groupBy.mockResolvedValue([
        { method: PaymentMethod.DINHEIRO, _sum: { amount: 300 } },
        { method: PaymentMethod.PIX, _sum: { amount: 200 } },
      ]);
      mockPrismaService.cashMovement.groupBy.mockResolvedValue([
        { type: CashMovementType.SUPRIMENTO, _sum: { amount: 50 } },
        { type: CashMovementType.SANGRIA, _sum: { amount: 120 } },
      ]);
    });

    it('should compute the expected amount from cash only', async () => {
      // 100 abertura + 300 dinheiro + 50 suprimento - 120 sangria = 330.
      // O PIX de 200 não passa pela gaveta
      mockPrismaService.cashSession.update.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(openSession(args.data)),
      );

      const result = await service.close('sess-1', 'comp-1', {
        countedCash: 330,
      });

      expect(mockPrismaService.cashSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CashSessionStatus.FECHADA,
            expectedCash: 330,
            countedCash: 330,
            difference: 0,
          }),
        }),
      );
      expect(result.summary.paymentBreakdown).toEqual([
        { method: PaymentMethod.DINHEIRO, amount: 300 },
        { method: PaymentMethod.PIX, amount: 200 },
      ]);
    });

    it('should require notes when there is a difference', async () => {
      await expect(
        service.close('sess-1', 'comp-1', { countedCash: 320 }),
      ).rejects.toThrow('Informe uma observação para a diferença de caixa');
      expect(mockPrismaService.cashSession.update).not.toHaveBeenCalled();
    });

    it('should close with a shortage when the difference is justified', async () => {
      mockPrismaService.cashSession.update.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(openSession(args.data)),
      );

      await service.close('sess-1', 'comp-1', {
        countedCash: 320,
        notes: 'Faltou troco',
      });

      expect(mockPrismaService.cashSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            difference: -10,
            closingNotes: 'Faltou troco',
          }),
        }),
      );
    });

    it('should accept a one cent difference without notes', async () => {
      mockPrismaService.cashSession.update.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(openSession(args.data)),
      );

      await service.close('sess-1', 'comp-1', { countedCash: 330.01 });

      expect(mockPrismaService.cashSession.update).toHaveBeenCalled();
    });

    it('should reject closing an already closed session', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue(
        openSession({ status: CashSessionStatus.FECHADA }),
      );

      await expect(
        service.close('sess-1', 'comp-1', { countedCash: 330 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('fechamento às cegas', () => {
    beforeEach(() => {
      mockPrismaService.company.findUnique.mockResolvedValue({
        cashBlindClose: true,
      });
      mockPrismaService.salePayment.groupBy.mockResolvedValue([
        { method: PaymentMethod.DINHEIRO, _sum: { amount: 300 } },
      ]);
    });

    it('should hide every figure that reveals the expected amount', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue(openSession());

      const result = await service.findOne('sess-1', 'comp-1');

      expect(result.summary.blind).toBe(true);
      expect(result.summary.expectedCash).toBeNull();
      expect(result.summary.cashSales).toBeNull();
      expect(result.summary.salesTotal).toBeNull();
      expect(result.summary.paymentBreakdown).toBeNull();
      expect(result.summary.creditTotal).toBeNull();
      // O que o operador já sabe continua visível
      expect(result.summary.openingAmount).toBe(100);
    });

    it('should reveal everything once the session is closed', async () => {
      mockPrismaService.cashSession.findFirst.mockResolvedValue(
        openSession({
          status: CashSessionStatus.FECHADA,
          countedCash: 400,
          difference: 0,
        }),
      );

      const result = await service.findOne('sess-1', 'comp-1');

      expect(result.summary.blind).toBe(false);
      expect(result.summary.expectedCash).toBe(400);
      expect(result.summary.countedCash).toBe(400);
    });
  });
});
