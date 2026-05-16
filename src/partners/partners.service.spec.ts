import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PartnerType } from '@prisma/client';
import { PartnersService } from './partners.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  partner: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

describe('PartnersService', () => {
  let service: PartnersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PartnersService>(PartnersService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated partners', async () => {
      const partners = [
        {
          id: 'partner-1',
          companyId: 'company-1',
          name: 'Client A',
          type: PartnerType.CLIENT,
        },
      ];
      mockPrismaService.partner.findMany.mockResolvedValue(partners);
      mockPrismaService.partner.count.mockResolvedValue(1);

      const result = await service.findAll('company-1', { page: 1, limit: 20 });

      expect(mockPrismaService.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            deletedAt: null,
          }),
          skip: 0,
          take: 20,
        }),
      );
      expect(mockPrismaService.partner.count).toHaveBeenCalled();
      expect(result).toEqual({ data: partners, total: 1, page: 1, limit: 20 });
    });

    it('should apply type filter when provided', async () => {
      mockPrismaService.partner.findMany.mockResolvedValue([]);
      mockPrismaService.partner.count.mockResolvedValue(0);

      await service.findAll('company-1', {
        page: 1,
        limit: 20,
        type: PartnerType.SUPPLIER,
      });

      expect(mockPrismaService.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: PartnerType.SUPPLIER }),
        }),
      );
    });

    it('should apply search filter when provided', async () => {
      mockPrismaService.partner.findMany.mockResolvedValue([]);
      mockPrismaService.partner.count.mockResolvedValue(0);

      await service.findAll('company-1', {
        page: 1,
        limit: 20,
        search: 'Acme',
      });

      expect(mockPrismaService.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'Acme', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should not apply type filter when not provided', async () => {
      mockPrismaService.partner.findMany.mockResolvedValue([]);
      mockPrismaService.partner.count.mockResolvedValue(0);

      await service.findAll('company-1', {});

      const callArgs = mockPrismaService.partner.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('type');
    });
  });

  describe('findOne', () => {
    it('should return a partner by id', async () => {
      const partner = {
        id: 'partner-1',
        companyId: 'company-1',
        name: 'Client A',
      };
      mockPrismaService.partner.findFirst.mockResolvedValue(partner);

      const result = await service.findOne('partner-1', 'company-1');

      expect(mockPrismaService.partner.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1', companyId: 'company-1', deletedAt: null },
        }),
      );
      expect(result).toEqual(partner);
    });

    it('should throw NotFoundException if partner not found', async () => {
      mockPrismaService.partner.findFirst.mockResolvedValue(null);

      await expect(service.findOne('partner-999', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create and return a partner', async () => {
      const dto = {
        name: 'New Partner',
        type: PartnerType.CLIENT,
        personType: 'PJ' as any,
      };
      const created = { id: 'partner-new', companyId: 'company-1', ...dto };
      mockPrismaService.partner.create.mockResolvedValue(created);

      const result = await service.create('company-1', dto as any);

      expect(mockPrismaService.partner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            name: 'New Partner',
            type: PartnerType.CLIENT,
          }),
        }),
      );
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('should call findOne then update and return the partner', async () => {
      const existing = {
        id: 'partner-1',
        companyId: 'company-1',
        name: 'Client A',
      };
      const updated = { ...existing, name: 'Client A Updated' };
      mockPrismaService.partner.findFirst.mockResolvedValue(existing);
      mockPrismaService.partner.update.mockResolvedValue(updated);

      const result = await service.update('partner-1', 'company-1', {
        name: 'Client A Updated',
      } as any);

      expect(mockPrismaService.partner.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'partner-1' } }),
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException if partner does not exist', async () => {
      mockPrismaService.partner.findFirst.mockResolvedValue(null);

      await expect(
        service.update('partner-999', 'company-1', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete by setting deletedAt', async () => {
      const existing = {
        id: 'partner-1',
        companyId: 'company-1',
        name: 'Client A',
      };
      mockPrismaService.partner.findFirst.mockResolvedValue(existing);
      mockPrismaService.partner.update.mockResolvedValue({
        ...existing,
        deletedAt: new Date(),
      });

      await service.remove('partner-1', 'company-1');

      expect(mockPrismaService.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw NotFoundException if partner does not exist', async () => {
      mockPrismaService.partner.findFirst.mockResolvedValue(null);

      await expect(service.remove('partner-999', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
