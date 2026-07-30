import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, SaleStatus, StockMovementType } from '@prisma/client';
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
};

const mockPrismaService = {
  $transaction: jest.fn().mockImplementation((callback) => callback(mockTx)),
  sale: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('SalesService', () => {
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((callback) =>
      callback(mockTx),
    );
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
      const result = await service.create('comp-1', dto as any);

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
      await service.create('comp-1', dto as any);

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
      await expect(service.create('comp-1', dto as any)).rejects.toThrow(
        BadRequestException,
      );
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
      };
      const result = await service.create('comp-1', dto as any);

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
        expect.objectContaining({ data: { status: SaleStatus.CONCLUIDA } }),
      );
      expect(result).toEqual({ id: 'sale-1', status: SaleStatus.CONCLUIDA });
    });

    it('should throw NotFoundException if establishment not found', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 0 } });
      mockTx.establishment.findFirst.mockResolvedValue(null);

      const dto = { establishmentId: 'est-999', items: [] };
      await expect(service.create('comp-1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    it('should create SAIDA movements and decrease the stock', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        saleNumber: 12,
        status: SaleStatus.ORCAMENTO,
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

      const result = await service.confirm('sale-1', 'comp-1');

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
        expect.objectContaining({ data: { status: SaleStatus.CONCLUIDA } }),
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

      await expect(service.confirm('sale-1', 'comp-1')).rejects.toThrow(
        'Estoque insuficiente para o produto Caneta',
      );
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

      await expect(service.confirm('sale-1', 'comp-1')).rejects.toThrow(
        'Estoque insuficiente para o produto Caneta',
      );
      expect(mockTx.product.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException if the sale is already finalized', async () => {
      mockTx.sale.findFirst.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.CONCLUIDA,
      });

      await expect(service.confirm('sale-1', 'comp-1')).rejects.toThrow(
        'Venda já finalizada',
      );
    });

    it('should throw NotFoundException if the sale does not exist', async () => {
      mockTx.sale.findFirst.mockResolvedValue(null);

      await expect(service.confirm('sale-999', 'comp-1')).rejects.toThrow(
        NotFoundException,
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
