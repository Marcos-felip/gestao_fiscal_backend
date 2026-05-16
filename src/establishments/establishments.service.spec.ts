import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EstablishmentType } from '@prisma/client';
import { EstablishmentsService } from './establishments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  establishment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('EstablishmentsService', () => {
  let service: EstablishmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstablishmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EstablishmentsService>(EstablishmentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a FILIAL establishment', async () => {
      const dto = { name: 'Filial SP', type: EstablishmentType.FILIAL };
      const created = { id: 'est-1', companyId: 'company-1', ...dto };
      mockPrismaService.establishment.create.mockResolvedValue(created);

      const result = await service.create('company-1', dto as any);

      expect(mockPrismaService.establishment.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.establishment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            name: 'Filial SP',
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('should create a MATRIZ establishment when none exists', async () => {
      const dto = { name: 'Matriz', type: EstablishmentType.MATRIZ };
      const created = { id: 'est-2', companyId: 'company-1', ...dto };
      mockPrismaService.establishment.findFirst.mockResolvedValue(null);
      mockPrismaService.establishment.create.mockResolvedValue(created);

      const result = await service.create('company-1', dto as any);

      expect(mockPrismaService.establishment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            type: EstablishmentType.MATRIZ,
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('should throw ConflictException if MATRIZ already exists', async () => {
      const dto = { name: 'Matriz 2', type: EstablishmentType.MATRIZ };
      mockPrismaService.establishment.findFirst.mockResolvedValue({
        id: 'existing',
      });

      await expect(service.create('company-1', dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all establishments for a company', async () => {
      const establishments = [
        {
          id: 'est-1',
          companyId: 'company-1',
          name: 'Matriz',
          type: EstablishmentType.MATRIZ,
        },
        {
          id: 'est-2',
          companyId: 'company-1',
          name: 'Filial',
          type: EstablishmentType.FILIAL,
        },
      ];
      mockPrismaService.establishment.findMany.mockResolvedValue(
        establishments,
      );

      const result = await service.findAll('company-1');

      expect(mockPrismaService.establishment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            deletedAt: null,
          }),
        }),
      );
      expect(result).toEqual(establishments);
    });
  });

  describe('findOne', () => {
    it('should return an establishment by id', async () => {
      const establishment = {
        id: 'est-1',
        companyId: 'company-1',
        name: 'Matriz',
      };
      mockPrismaService.establishment.findFirst.mockResolvedValue(
        establishment,
      );

      const result = await service.findOne('est-1', 'company-1');

      expect(result).toEqual(establishment);
    });

    it('should throw NotFoundException if establishment not found', async () => {
      mockPrismaService.establishment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('est-999', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return the establishment', async () => {
      const establishment = {
        id: 'est-1',
        companyId: 'company-1',
        name: 'Matriz',
        type: EstablishmentType.MATRIZ,
      };
      const updated = { ...establishment, name: 'Matriz Updated' };
      mockPrismaService.establishment.findFirst.mockResolvedValue(
        establishment,
      );
      mockPrismaService.establishment.update.mockResolvedValue(updated);

      const result = await service.update('est-1', 'company-1', {
        name: 'Matriz Updated',
      } as any);

      expect(mockPrismaService.establishment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'est-1' } }),
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should soft delete a FILIAL establishment', async () => {
      const establishment = {
        id: 'est-2',
        companyId: 'company-1',
        name: 'Filial',
        type: EstablishmentType.FILIAL,
      };
      const deleted = { ...establishment, deletedAt: new Date() };
      mockPrismaService.establishment.findFirst.mockResolvedValue(
        establishment,
      );
      mockPrismaService.establishment.update.mockResolvedValue(deleted);

      const result = await service.remove('est-2', 'company-1');

      expect(mockPrismaService.establishment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'est-2' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(result).toEqual(deleted);
    });

    it('should throw BadRequestException when trying to remove MATRIZ', async () => {
      const establishment = {
        id: 'est-1',
        companyId: 'company-1',
        name: 'Matriz',
        type: EstablishmentType.MATRIZ,
      };
      mockPrismaService.establishment.findFirst.mockResolvedValue(
        establishment,
      );

      await expect(service.remove('est-1', 'company-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
