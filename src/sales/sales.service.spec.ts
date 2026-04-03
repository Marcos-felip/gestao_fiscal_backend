import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SaleStatus, StockMovementType } from '@prisma/client';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  sale: {
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
    mockPrismaService.$transaction.mockImplementation((callback) => callback(mockTx));
  });

  describe('create', () => {
    it('should create sale with sequential saleNumber and items', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 3 } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1', companyId: 'comp-1' });
      const createdSale = {
        id: 'sale-1',
        saleNumber: 4,
        totalAmount: 100,
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 50, discount: 0, total: 100 }],
      };
      mockTx.sale.create.mockResolvedValue(createdSale);

      const dto = {
        establishmentId: 'est-1',
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 50 }],
      };
      const result = await service.create('comp-1', dto as any);

      expect(mockTx.sale.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'comp-1' }) }),
      );
      expect(mockTx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ saleNumber: 4, companyId: 'comp-1' }),
        }),
      );
      expect(result).toEqual(createdSale);
    });

    it('should use saleNumber 1 when no existing sales', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: null } });
      mockTx.establishment.findFirst.mockResolvedValue({ id: 'est-1' });
      mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mockTx.sale.create.mockResolvedValue({ id: 'sale-1', saleNumber: 1, items: [] });

      const dto = { establishmentId: 'est-1', items: [{ productId: 'prod-1', quantity: 1, unitPrice: 10 }] };
      await service.create('comp-1', dto as any);

      expect(mockTx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ saleNumber: 1 }) }),
      );
    });

    it('should throw NotFoundException if establishment not found', async () => {
      mockTx.sale.aggregate.mockResolvedValue({ _max: { saleNumber: 0 } });
      mockTx.establishment.findFirst.mockResolvedValue(null);

      const dto = { establishmentId: 'est-999', items: [] };
      await expect(service.create('comp-1', dto as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated sales', async () => {
      const sales = [{ id: 'sale-1', saleNumber: 1 }];
      mockPrismaService.sale.findMany.mockResolvedValue(sales);
      mockPrismaService.sale.count.mockResolvedValue(1);

      const result = await service.findAll('comp-1', { page: 1, limit: 20 });

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'comp-1', deletedAt: null }),
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({ data: sales, total: 1, page: 1, limit: 20 });
    });
  });

  describe('findOne', () => {
    it('should return sale with items', async () => {
      const sale = { id: 'sale-1', items: [] };
      mockPrismaService.sale.findFirst.mockResolvedValue(sale);

      const result = await service.findOne('sale-1', 'comp-1');

      expect(mockPrismaService.sale.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sale-1', companyId: 'comp-1', deletedAt: null } }),
      );
      expect(result).toEqual(sale);
    });

    it('should throw NotFoundException if sale not found', async () => {
      mockPrismaService.sale.findFirst.mockResolvedValue(null);

      await expect(service.findOne('sale-999', 'comp-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a DRAFT sale', async () => {
      const existingSale = { id: 'sale-1', status: SaleStatus.DRAFT, items: [] };
      const updatedSale = { ...existingSale, notes: 'updated' };
      mockPrismaService.sale.findFirst.mockResolvedValue(existingSale);
      mockPrismaService.sale.update.mockResolvedValue(updatedSale);

      const result = await service.update('sale-1', 'comp-1', { notes: 'updated' } as any);

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sale-1' } }),
      );
      expect(result).toEqual(updatedSale);
    });

    it('should throw BadRequestException if sale is not DRAFT', async () => {
      const existingSale = { id: 'sale-1', status: SaleStatus.CONFIRMED, items: [] };
      mockPrismaService.sale.findFirst.mockResolvedValue(existingSale);

      await expect(service.update('sale-1', 'comp-1', {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm', () => {
    it('should create SAIDA stock movements and set status CONFIRMED', async () => {
      const sale = {
        id: 'sale-1',
        saleNumber: 1,
        status: SaleStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 2 }],
      };
      const product = { id: 'prod-1', name: 'Product A', currentStock: 10 };
      const confirmedSale = { ...sale, status: SaleStatus.CONFIRMED };

      mockTx.sale.findFirst.mockResolvedValue(sale);
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.product.update.mockResolvedValue({});
      mockTx.sale.update.mockResolvedValue(confirmedSale);

      const result = await service.confirm('sale-1', 'comp-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.SAIDA,
            productId: 'prod-1',
            quantity: 2,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 8 } }),
      );
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SaleStatus.CONFIRMED } }),
      );
      expect(result).toEqual(confirmedSale);
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      const sale = {
        id: 'sale-1',
        saleNumber: 1,
        status: SaleStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 20 }],
      };
      const product = { id: 'prod-1', name: 'Product A', currentStock: 5 };

      mockTx.sale.findFirst.mockResolvedValue(sale);
      mockTx.product.findFirst.mockResolvedValue(product);

      await expect(service.confirm('sale-1', 'comp-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if sale not found', async () => {
      mockTx.sale.findFirst.mockResolvedValue(null);

      await expect(service.confirm('sale-999', 'comp-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('should reverse stock movements when cancelling CONFIRMED sale', async () => {
      const sale = {
        id: 'sale-1',
        saleNumber: 1,
        status: SaleStatus.CONFIRMED,
        items: [{ productId: 'prod-1', quantity: 3 }],
      };
      const product = { id: 'prod-1', currentStock: 7 };
      const cancelledSale = { ...sale, status: SaleStatus.CANCELLED };

      mockTx.sale.findFirst.mockResolvedValue(sale);
      mockTx.product.findFirst.mockResolvedValue(product);
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.product.update.mockResolvedValue({});
      mockTx.sale.update.mockResolvedValue(cancelledSale);

      const result = await service.cancel('sale-1', 'comp-1');

      expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: StockMovementType.ENTRADA,
            productId: 'prod-1',
            quantity: 3,
          }),
        }),
      );
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 10 } }),
      );
      expect(result).toEqual(cancelledSale);
    });

    it('should cancel a DRAFT sale without stock movements', async () => {
      const sale = {
        id: 'sale-1',
        saleNumber: 1,
        status: SaleStatus.DRAFT,
        items: [{ productId: 'prod-1', quantity: 3 }],
      };
      const cancelledSale = { ...sale, status: SaleStatus.CANCELLED };

      mockTx.sale.findFirst.mockResolvedValue(sale);
      mockTx.sale.update.mockResolvedValue(cancelledSale);

      const result = await service.cancel('sale-1', 'comp-1');

      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
      expect(mockTx.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: SaleStatus.CANCELLED } }),
      );
      expect(result).toEqual(cancelledSale);
    });

    it('should throw NotFoundException if sale not found', async () => {
      mockTx.sale.findFirst.mockResolvedValue(null);

      await expect(service.cancel('sale-999', 'comp-1')).rejects.toThrow(NotFoundException);
    });
  });
});
