import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseStatus, StockMovementType } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  purchase: {
    aggregate: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  establishment: {
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
  purchase: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('PurchasesService', () => {
  let service: PurchasesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((callback) =>
      callback(mockTx),
    );
  });

  describe('create', () => {
    it('should create purchase with sequential purchaseNumber', async () => {
      mockTx.purchase.aggregate.mockResolvedValue({
        _max: { purchaseNumber: 5 },
      });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      const createdPurchase = {
        id: 'purch-1',
        purchaseNumber: 6,
        totalAmount: 200,
        items: [
          { productId: 'prod-1', quantity: 4, unitPrice: 50, total: 200 },
        ],
      };
      mockTx.purchase.create.mockResolvedValue(createdPurchase);

      const dto = {
        establishmentId: 'est-1',
        items: [{ productId: 'prod-1', quantity: 4, unitPrice: 50 }],
      };
      const result = await service.create('comp-1', dto as any);

      expect(mockTx.purchase.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'comp-1' }),
        }),
      );
      expect(mockTx.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseNumber: 6,
            companyId: 'comp-1',
            totalAmount: 200,
          }),
        }),
      );
      expect(result).toEqual(createdPurchase);
    });

    it('should use purchaseNumber 1 when no existing purchases', async () => {
      mockTx.purchase.aggregate.mockResolvedValue({
        _max: { purchaseNumber: null },
      });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mockTx.purchase.create.mockResolvedValue({
        id: 'purch-1',
        purchaseNumber: 1,
        items: [],
      });

      const dto = {
        establishmentId: 'est-1',
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 10 }],
      };
      await service.create('comp-1', dto as any);

      expect(mockTx.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ purchaseNumber: 1 }),
        }),
      );
    });

    it('should throw NotFoundException if establishment not found', async () => {
      mockTx.purchase.aggregate.mockResolvedValue({
        _max: { purchaseNumber: 0 },
      });
      mockTx.establishment.findFirst.mockResolvedValue(null);

      const dto = { establishmentId: 'est-999', items: [] };
      await expect(service.create('comp-1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      mockTx.purchase.aggregate.mockResolvedValue({
        _max: { purchaseNumber: 0 },
      });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue(null);

      const dto = {
        establishmentId: 'est-1',
        items: [{ productId: 'prod-999', quantity: 1, unitPrice: 10 }],
      };
      await expect(service.create('comp-1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    it('should create ENTRADA stock movements and increase product stock', async () => {
      const purchase = {
        id: 'purch-1',
        purchaseNumber: 1,
        status: PurchaseStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 10 }],
      };
      const product = { id: 'prod-1', currentStock: 5 };
      const confirmedPurchase = {
        ...purchase,
        status: PurchaseStatus.CONFIRMED,
      };

      mockTx.purchase.findFirst.mockResolvedValue(purchase);
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.product.update.mockResolvedValue({});
      mockTx.purchase.update.mockResolvedValue(confirmedPurchase);

      const result = await service.confirm('purch-1', 'comp-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.ENTRADA,
            productId: 'prod-1',
            quantity: 10,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 15 } }),
      );
      expect(mockTx.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PurchaseStatus.CONFIRMED } }),
      );
      expect(result).toEqual(confirmedPurchase);
    });

    it('should throw NotFoundException if purchase not found', async () => {
      mockTx.purchase.findFirst.mockResolvedValue(null);

      await expect(service.confirm('purch-999', 'comp-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if purchase is not DRAFT', async () => {
      const purchase = {
        id: 'purch-1',
        status: PurchaseStatus.CONFIRMED,
        items: [],
      };
      mockTx.purchase.findFirst.mockResolvedValue(purchase);

      await expect(service.confirm('purch-1', 'comp-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('should create SAIDA movements to reverse stock when cancelling CONFIRMED purchase', async () => {
      const purchase = {
        id: 'purch-1',
        purchaseNumber: 1,
        status: PurchaseStatus.CONFIRMED,
        items: [{ productId: 'prod-1', quantity: 10 }],
      };
      const product = { id: 'prod-1', currentStock: 15 };
      const cancelledPurchase = {
        ...purchase,
        status: PurchaseStatus.CANCELLED,
      };

      mockTx.purchase.findFirst.mockResolvedValue(purchase);
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.product.update.mockResolvedValue({});
      mockTx.purchase.update.mockResolvedValue(cancelledPurchase);

      const result = await service.cancel('purch-1', 'comp-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.SAIDA,
            productId: 'prod-1',
            quantity: 10,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 5 } }),
      );
      expect(result).toEqual(cancelledPurchase);
    });

    it('should cancel DRAFT purchase without stock movements', async () => {
      const purchase = {
        id: 'purch-1',
        purchaseNumber: 1,
        status: PurchaseStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 5 }],
      };
      const cancelledPurchase = {
        ...purchase,
        status: PurchaseStatus.CANCELLED,
      };

      mockTx.purchase.findFirst.mockResolvedValue(purchase);
      mockTx.purchase.update.mockResolvedValue(cancelledPurchase);

      const result = await service.cancel('purch-1', 'comp-1');

      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PurchaseStatus.CANCELLED } }),
      );
      expect(result).toEqual(cancelledPurchase);
    });

    it('should throw NotFoundException if purchase not found', async () => {
      mockTx.purchase.findFirst.mockResolvedValue(null);

      await expect(service.cancel('purch-999', 'comp-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
