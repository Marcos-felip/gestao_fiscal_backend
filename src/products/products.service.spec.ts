import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  product: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  company: {
    findFirst: jest.fn(),
  },
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
    mockPrismaService.company.findFirst.mockResolvedValue({
      crt: 'SIMPLES_NACIONAL',
    });
  });

  describe('findAll', () => {
    it('should return paginated products with total count', async () => {
      const products = [
        { id: 'prod-1', companyId: 'company-1', name: 'Product A' },
        { id: 'prod-2', companyId: 'company-1', name: 'Product B' },
      ];
      mockPrismaService.product.findMany.mockResolvedValue(products);
      mockPrismaService.product.count.mockResolvedValue(2);

      const result = await service.findAll('company-1', { page: 1, limit: 20 });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            deletedAt: null,
          }),
          skip: 0,
          take: 20,
        }),
      );
      expect(mockPrismaService.product.count).toHaveBeenCalled();
      expect(result).toEqual({ data: products, total: 2, page: 1, limit: 20 });
    });

    it('should apply search filter when provided', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll('company-1', {
        page: 1,
        limit: 20,
        search: 'Widget',
      });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'Widget', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should use default page 1 and limit 20 when not provided', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      const result = await service.findAll('company-1', {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      const product = {
        id: 'prod-1',
        companyId: 'company-1',
        name: 'Product A',
      };
      mockPrismaService.product.findFirst.mockResolvedValue(product);

      const result = await service.findOne('prod-1', 'company-1');

      expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1', companyId: 'company-1', deletedAt: null },
        }),
      );
      expect(result).toEqual(product);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne('prod-999', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create and return a product', async () => {
      const dto = { name: 'New Product', unit: 'UN' as any };
      const created = { id: 'prod-new', companyId: 'company-1', ...dto };
      mockPrismaService.product.create.mockResolvedValue(created);

      const result = await service.create('company-1', dto as any);

      expect(mockPrismaService.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            name: 'New Product',
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('deriva fiscalComplete a partir dos dados fiscais do produto', async () => {
      mockPrismaService.product.create.mockResolvedValue({});

      await service.create('company-1', {
        name: 'Refrigerante',
        ncm: '22021000',
        cfop: '5102',
        origin: 0,
        csosn: '102',
      });

      expect(mockPrismaService.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fiscalComplete: true }) as unknown,
        }),
      );
    });

    it('marca fiscalComplete como falso quando o CSOSN não é suportado', async () => {
      mockPrismaService.product.create.mockResolvedValue({});

      await service.create('company-1', {
        name: 'Refrigerante',
        ncm: '22021000',
        cfop: '5102',
        origin: 0,
        csosn: '101',
      });

      expect(mockPrismaService.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fiscalComplete: false }) as unknown,
        }),
      );
    });
  });

  describe('update', () => {
    it('should call findOne then update and return the product', async () => {
      const existing = {
        id: 'prod-1',
        companyId: 'company-1',
        name: 'Product A',
      };
      const updated = { ...existing, name: 'Product A Updated' };
      mockPrismaService.product.findFirst.mockResolvedValue(existing);
      mockPrismaService.product.update.mockResolvedValue(updated);

      const result = await service.update('prod-1', 'company-1', {
        name: 'Product A Updated',
      } as any);

      expect(mockPrismaService.product.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-1' } }),
      );
      expect(result).toEqual(updated);
    });

    it('recalcula fiscalComplete combinando o cadastro atual com o dto', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        companyId: 'company-1',
        ncm: '22021000',
        cfop: '5102',
        origin: 0,
        csosn: null,
      });
      mockPrismaService.product.update.mockResolvedValue({});

      await service.update('prod-1', 'company-1', { csosn: '102' });

      expect(mockPrismaService.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fiscalComplete: true }) as unknown,
        }),
      );
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update('prod-999', 'company-1', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete by setting deletedAt', async () => {
      const existing = {
        id: 'prod-1',
        companyId: 'company-1',
        name: 'Product A',
      };
      mockPrismaService.product.findFirst.mockResolvedValue(existing);
      mockPrismaService.product.update.mockResolvedValue({
        ...existing,
        deletedAt: new Date(),
      });

      await service.remove('prod-1', 'company-1');

      expect(mockPrismaService.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(service.remove('prod-999', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
