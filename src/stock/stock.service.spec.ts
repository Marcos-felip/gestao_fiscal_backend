import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
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
  stockMovement: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('StockService', () => {
  let service: StockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((callback) =>
      callback(mockTx),
    );
  });

  describe('createMovement', () => {
    it('ENTRADA should increase stock', async () => {
      const product = { id: 'prod-1', currentStock: 10, companyId: 'comp-1' };
      const movement = {
        id: 'mov-1',
        type: StockMovementType.ENTRADA,
        quantity: 5,
      };
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue(movement);
      mockTx.product.update.mockResolvedValue({});

      const dto = {
        productId: 'prod-1',
        type: StockMovementType.ENTRADA,
        quantity: 5,
        reason: 'test',
      };
      const result = await service.createMovement('comp-1', dto as any);

      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 15 } }),
      );
      expect(result).toEqual(movement);
    });

    it('SAIDA should decrease stock', async () => {
      const product = { id: 'prod-1', currentStock: 10, companyId: 'comp-1' };
      const movement = {
        id: 'mov-1',
        type: StockMovementType.SAIDA,
        quantity: 3,
      };
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue(movement);
      mockTx.product.update.mockResolvedValue({});

      const dto = {
        productId: 'prod-1',
        type: StockMovementType.SAIDA,
        quantity: 3,
        reason: 'test',
      };
      const result = await service.createMovement('comp-1', dto as any);

      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 7 } }),
      );
      expect(result).toEqual(movement);
    });

    it('AJUSTE should set stock directly', async () => {
      const product = { id: 'prod-1', currentStock: 10, companyId: 'comp-1' };
      const movement = {
        id: 'mov-1',
        type: StockMovementType.AJUSTE,
        quantity: 20,
      };
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue(movement);
      mockTx.product.update.mockResolvedValue({});

      const dto = {
        productId: 'prod-1',
        type: StockMovementType.AJUSTE,
        quantity: 20,
        reason: 'adjustment',
      };
      await service.createMovement('comp-1', dto as any);

      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 20 } }),
      );
    });

    it('SAIDA with insufficient stock should throw BadRequestException', async () => {
      const product = { id: 'prod-1', currentStock: 2, companyId: 'comp-1' };
      mockTx.product.findFirst.mockResolvedValue(product);

      const dto = {
        productId: 'prod-1',
        type: StockMovementType.SAIDA,
        quantity: 5,
        reason: 'test',
      };

      await expect(
        service.createMovement('comp-1', dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockTx.product.findFirst.mockResolvedValue(null);

      const dto = {
        productId: 'prod-999',
        type: StockMovementType.ENTRADA,
        quantity: 5,
      };

      await expect(
        service.createMovement('comp-1', dto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated stock movements', async () => {
      const movements = [
        { id: 'mov-1', type: StockMovementType.ENTRADA, quantity: 10 },
        { id: 'mov-2', type: StockMovementType.SAIDA, quantity: 5 },
      ];
      mockPrismaService.stockMovement.findMany.mockResolvedValue(movements);
      mockPrismaService.stockMovement.count.mockResolvedValue(2);

      const result = await service.findAll('comp-1', { page: 1, limit: 20 });

      expect(mockPrismaService.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'comp-1',
            deletedAt: null,
          }),
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({ data: movements, total: 2, page: 1, limit: 20 });
    });

    it('should use default page 1 and limit 20', async () => {
      mockPrismaService.stockMovement.findMany.mockResolvedValue([]);
      mockPrismaService.stockMovement.count.mockResolvedValue(0);

      const result = await service.findAll('comp-1', {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
