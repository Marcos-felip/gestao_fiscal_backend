import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashSessionStatus } from '@prisma/client';
import { CashRegistersService } from './cash-registers.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  establishment: {
    findFirst: jest.fn(),
  },
  cashRegister: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  cashSession: {
    findFirst: jest.fn(),
  },
};

describe('CashRegistersService', () => {
  let service: CashRegistersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegistersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CashRegistersService>(CashRegistersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a cash register for an existing establishment', async () => {
      mockPrismaService.establishment.findFirst.mockResolvedValue({
        id: 'est-1',
      });
      const created = { id: 'reg-1', name: 'Caixa 01' };
      mockPrismaService.cashRegister.create.mockResolvedValue(created);

      const result = await service.create('comp-1', {
        establishmentId: 'est-1',
        name: 'Caixa 01',
      });

      expect(mockPrismaService.cashRegister.create).toHaveBeenCalledWith({
        data: {
          companyId: 'comp-1',
          establishmentId: 'est-1',
          name: 'Caixa 01',
          isActive: undefined,
        },
      });
      expect(result).toEqual(created);
    });

    it('should reject an establishment from another company', async () => {
      mockPrismaService.establishment.findFirst.mockResolvedValue(null);

      await expect(
        service.create('comp-1', {
          establishmentId: 'est-outra',
          name: 'Caixa 01',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.cashRegister.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should scope the query to the company and skip the deleted ones', async () => {
      mockPrismaService.cashRegister.findMany.mockResolvedValue([]);

      await service.findAll('comp-1', { establishmentId: 'est-1' });

      expect(mockPrismaService.cashRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 'comp-1',
            deletedAt: null,
            establishmentId: 'est-1',
          },
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should throw when the cash register does not exist', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue(null);

      await expect(service.findOne('reg-999', 'comp-1')).rejects.toThrow(
        'Caixa não encontrado',
      );
    });
  });

  describe('update', () => {
    it('should rename a cash register', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
      });
      mockPrismaService.cashRegister.update.mockResolvedValue({
        id: 'reg-1',
        name: 'Caixa 02',
      });

      await service.update('reg-1', 'comp-1', { name: 'Caixa 02' });

      // Sem isActive: false não há motivo para consultar sessões
      expect(mockPrismaService.cashSession.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.cashRegister.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { name: 'Caixa 02', isActive: undefined },
      });
    });

    it('should block deactivating a cash register with an open session', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
      });
      mockPrismaService.cashSession.findFirst.mockResolvedValue({
        id: 'sess-1',
      });

      await expect(
        service.update('reg-1', 'comp-1', { isActive: false }),
      ).rejects.toThrow('Não é possível desativar um caixa com sessão aberta');

      expect(mockPrismaService.cashSession.findFirst).toHaveBeenCalledWith({
        where: { cashRegisterId: 'reg-1', status: CashSessionStatus.ABERTA },
        select: { id: true },
      });
      expect(mockPrismaService.cashRegister.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete the cash register', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
      });
      mockPrismaService.cashSession.findFirst.mockResolvedValue(null);

      await service.remove('reg-1', 'comp-1');

      expect(mockPrismaService.cashRegister.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should block deleting a cash register with an open session', async () => {
      mockPrismaService.cashRegister.findFirst.mockResolvedValue({
        id: 'reg-1',
      });
      mockPrismaService.cashSession.findFirst.mockResolvedValue({
        id: 'sess-1',
      });

      await expect(service.remove('reg-1', 'comp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.cashRegister.update).not.toHaveBeenCalled();
    });
  });
});
