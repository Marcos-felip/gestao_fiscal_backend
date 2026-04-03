import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole, TaxRegime, EstablishmentType } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  company: { create: jest.fn(), update: jest.fn() },
  membership: { create: jest.fn() },
  user: { update: jest.fn() },
  establishment: { findFirst: jest.fn(), create: jest.fn() },
};

const mockPrismaService = {
  $transaction: jest.fn(),
  company: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('CompaniesService', () => {
  let service: CompaniesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call prisma.$transaction and create company, membership, and update user', async () => {
      const mockCompany = { id: 'company-1', name: 'Test Co', type: 'MEI', phone: null };
      const mockMembership = { id: 'm1', userId: 'user-1', companyId: 'company-1', role: MembershipRole.OWNER };

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        mockTx.company.create.mockResolvedValue(mockCompany);
        mockTx.membership.create.mockResolvedValue(mockMembership);
        mockTx.user.update.mockResolvedValue({});
        return cb(mockTx);
      });

      const result = await service.create('user-1', {
        name: 'Test Co',
        type: 'MEI' as any,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockTx.company.create).toHaveBeenCalled();
      expect(mockTx.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            companyId: 'company-1',
            role: MembershipRole.OWNER,
          }),
        }),
      );
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { companyActiveId: 'company-1' },
      });
      expect(result).toEqual({ company: mockCompany, membership: mockMembership });
    });
  });

  describe('findAllForUser', () => {
    it('should return companies via memberships', async () => {
      const companies = [
        { id: 'company-1', name: 'Test Co', memberships: [{ role: MembershipRole.OWNER }] },
      ];
      mockPrismaService.company.findMany.mockResolvedValue(companies);

      const result = await service.findAllForUser('user-1');

      expect(mockPrismaService.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: expect.objectContaining({
              some: expect.objectContaining({ userId: 'user-1' }),
            }),
          }),
        }),
      );
      expect(result).toEqual(companies);
    });
  });

  describe('findOne', () => {
    it('should return company when id matches companyId', async () => {
      const company = { id: 'company-1', name: 'Test Co' };
      mockPrismaService.company.findFirst.mockResolvedValue(company);

      const result = await service.findOne('company-1', 'company-1');

      expect(result).toEqual(company);
    });

    it('should throw ForbiddenException if id does not match companyId', async () => {
      await expect(
        service.findOne('company-1', 'company-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('company-1', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('onboard', () => {
    const onboardingDto = {
      cnpj: '11222333000181',
      taxRegime: TaxRegime.SIMPLES_NACIONAL,
      establishmentName: 'Sede Principal',
      city: 'São Paulo',
      state: 'SP',
    };

    it('should update company, create MATRIZ establishment, and return updated company', async () => {
      const company = { id: 'company-1', name: 'Test Co', isOnboarded: false };
      const updatedCompany = { ...company, cnpj: onboardingDto.cnpj, isOnboarded: true };
      mockPrismaService.company.findFirst.mockResolvedValue(company);

      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        mockTx.establishment.findFirst.mockResolvedValue(null);
        mockTx.company.update
          .mockResolvedValueOnce({ ...company, cnpj: onboardingDto.cnpj })
          .mockResolvedValueOnce(updatedCompany);
        mockTx.establishment.create.mockResolvedValue({ id: 'est-1', type: EstablishmentType.MATRIZ });
        return cb(mockTx);
      });

      const result = await service.onboard('company-1', onboardingDto as any);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockTx.establishment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            type: EstablishmentType.MATRIZ,
          }),
        }),
      );
      expect(result).toEqual(updatedCompany);
    });

    it('should throw BadRequestException if company is already onboarded', async () => {
      const company = { id: 'company-1', name: 'Test Co', isOnboarded: true };
      mockPrismaService.company.findFirst.mockResolvedValue(company);

      await expect(service.onboard('company-1', onboardingDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(service.onboard('nonexistent', onboardingDto as any)).rejects.toThrow(NotFoundException);
    });
  });
});
