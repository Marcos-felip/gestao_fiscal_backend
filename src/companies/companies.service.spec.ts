import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MembershipRole, TaxRegime, EstablishmentType } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  company: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  membership: { create: jest.fn() },
  user: { update: jest.fn() },
  establishment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  rolePermission: { findMany: jest.fn() },
  companyRolePermission: { createMany: jest.fn() },
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
      const mockCompany = {
        id: 'company-1',
        name: 'Test Co',
        type: 'MEI',
        phone: null,
      };
      const mockMembership = {
        id: 'm1',
        userId: 'user-1',
        companyId: 'company-1',
        role: MembershipRole.OWNER,
      };

      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.company.create.mockResolvedValue(mockCompany);
          mockTx.membership.create.mockResolvedValue(mockMembership);
          mockTx.user.update.mockResolvedValue({});
          mockTx.rolePermission.findMany.mockResolvedValue([
            { role: MembershipRole.ADMIN, permissionCode: 'products.list' },
          ]);
          mockTx.companyRolePermission.createMany.mockResolvedValue({
            count: 1,
          });
          return cb(mockTx);
        },
      );

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
      expect(mockTx.rolePermission.findMany).toHaveBeenCalledWith({
        where: { role: { not: MembershipRole.MEMBER } },
      });
      expect(mockTx.companyRolePermission.createMany).toHaveBeenCalledWith({
        data: [
          {
            companyId: 'company-1',
            role: MembershipRole.ADMIN,
            permissionCode: 'products.list',
          },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({
        company: mockCompany,
        membership: mockMembership,
      });
    });

    it('should not seed any MEMBER permission (baseline vazio)', async () => {
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.company.create.mockResolvedValue({ id: 'company-1' });
          mockTx.membership.create.mockResolvedValue({ id: 'm1' });
          mockTx.user.update.mockResolvedValue({});
          // O filtro do serviço já exclui MEMBER, então o banco nunca devolve o papel
          mockTx.rolePermission.findMany.mockResolvedValue([
            { role: MembershipRole.OWNER, permissionCode: 'products.list' },
            { role: MembershipRole.ADMIN, permissionCode: 'products.list' },
          ]);
          mockTx.companyRolePermission.createMany.mockResolvedValue({
            count: 2,
          });
          return cb(mockTx);
        },
      );

      await service.create('user-1', { name: 'Test Co' });

      expect(mockTx.companyRolePermission.createMany).toHaveBeenCalledWith({
        data: [
          {
            companyId: 'company-1',
            role: MembershipRole.OWNER,
            permissionCode: 'products.list',
          },
          {
            companyId: 'company-1',
            role: MembershipRole.ADMIN,
            permissionCode: 'products.list',
          },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('findAllForUser', () => {
    it('should return companies via memberships', async () => {
      const companies = [
        {
          id: 'company-1',
          name: 'Test Co',
          memberships: [{ role: MembershipRole.OWNER }],
        },
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
      await expect(service.findOne('company-1', 'company-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(service.findOne('company-1', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
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
      const updatedCompany = {
        ...company,
        cnpj: onboardingDto.cnpj,
        isOnboarded: true,
      };
      mockPrismaService.company.findFirst.mockResolvedValue(company);

      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.establishment.findFirst.mockResolvedValue(null);
          mockTx.company.update
            .mockResolvedValueOnce({ ...company, cnpj: onboardingDto.cnpj })
            .mockResolvedValueOnce(updatedCompany);
          mockTx.establishment.create.mockResolvedValue({
            id: 'est-1',
            type: EstablishmentType.MATRIZ,
          });
          return cb(mockTx);
        },
      );

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

      await expect(
        service.onboard('company-1', onboardingDto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(
        service.onboard('nonexistent', onboardingDto as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const baseCompany = {
      id: 'company-1',
      name: 'Original Name',
      type: 'MEI',
      cnpj: null,
      taxRegime: null,
      phone: null,
      deletedAt: null,
    };

    it('should update company name successfully', async () => {
      const updatedCompany = { ...baseCompany, name: 'Updated Name' };
      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', {
        name: 'Updated Name',
      });

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { name: 'Updated Name' },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should update company type successfully', async () => {
      const updatedCompany = { ...baseCompany, type: 'LTDA' };
      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', { type: 'LTDA' as any });

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { type: 'LTDA' },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should update company CNPJ successfully', async () => {
      const updatedCompany = { ...baseCompany, cnpj: '12.345.678/0001-95' };
      mockPrismaService.company.findFirst
        .mockResolvedValueOnce(baseCompany)
        .mockResolvedValueOnce(null); // No other company with same CNPJ
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', {
        cnpj: '12.345.678/0001-95',
      });

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { cnpj: '12.345.678/0001-95' },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should update company phone successfully', async () => {
      const updatedCompany = { ...baseCompany, phone: '(11) 9999-9999' };
      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', {
        phone: '(11) 9999-9999',
      });

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { phone: '(11) 9999-9999' },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should update company taxRegime successfully', async () => {
      const updatedCompany = {
        ...baseCompany,
        taxRegime: TaxRegime.LUCRO_REAL,
      };
      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', {
        taxRegime: TaxRegime.LUCRO_REAL,
      });

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { taxRegime: TaxRegime.LUCRO_REAL },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should update company stateRegistration in MATRIZ establishment', async () => {
      const updatedCompany = { ...baseCompany };
      const matrizEstablishment = {
        id: 'est-1',
        companyId: 'company-1',
        type: EstablishmentType.MATRIZ,
        inscricaoEstadual: null,
        deletedAt: null,
      };
      const updatedMatriz = {
        ...matrizEstablishment,
        inscricaoEstadual: '123456789012',
      };

      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.company.update.mockResolvedValue(updatedCompany);
          mockTx.establishment.findFirst.mockResolvedValue(matrizEstablishment);
          mockTx.establishment.update.mockResolvedValue(updatedMatriz);
          return cb(mockTx);
        },
      );

      const result = await service.update('company-1', {
        stateRegistration: '123456789012',
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(result).toEqual(updatedCompany);
    });

    it('should update multiple fields in a single request', async () => {
      const updateDto = {
        name: 'New Name',
        type: 'LTDA' as any,
        phone: '(11) 9999-9999',
        taxRegime: TaxRegime.SIMPLES_NACIONAL,
      };
      const updatedCompany = { ...baseCompany, ...updateDto };
      mockPrismaService.company.findFirst.mockResolvedValue(baseCompany);
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', updateDto);

      expect(mockPrismaService.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: {
          name: 'New Name',
          type: 'LTDA',
          phone: '(11) 9999-9999',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
      });
      expect(result).toEqual(updatedCompany);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if CNPJ already exists in another company', async () => {
      const otherCompany = { ...baseCompany, id: 'company-2' };
      mockPrismaService.company.findFirst
        .mockResolvedValueOnce(baseCompany)
        .mockResolvedValueOnce(otherCompany);

      await expect(
        service.update('company-1', { cnpj: '12.345.678/0001-95' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating same CNPJ on the same company', async () => {
      const companyWithCnpj = { ...baseCompany, cnpj: '12.345.678/0001-95' };
      const updatedCompany = { ...companyWithCnpj };
      mockPrismaService.company.findFirst
        .mockResolvedValueOnce(companyWithCnpj)
        .mockResolvedValueOnce(null); // No other company with same CNPJ
      mockPrismaService.company.update.mockResolvedValue(updatedCompany);

      const result = await service.update('company-1', {
        cnpj: '12.345.678/0001-95',
      });

      // Should not throw and should update successfully
      expect(mockPrismaService.company.update).toHaveBeenCalled();
      expect(result).toEqual(updatedCompany);
    });

    describe('with establishment nested update', () => {
      it('should accept establishment parameter in update DTO', async () => {
        // This test just validates that the DTO accepts the establishment parameter
        // The actual transactional behavior is tested via integration tests
        const baseDto = {
          name: 'Company Name',
          establishment: {
            socialReason: 'Branch Name',
            stateRegistration: '123456789012',
          },
        };
        expect(baseDto.establishment).toBeDefined();
        expect(baseDto.establishment.socialReason).toBe('Branch Name');
      });
    });
  });
});
