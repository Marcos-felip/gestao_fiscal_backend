import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  permission: {
    findMany: jest.fn(),
  },
  companyRolePermission: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const COMPANY_ID = 'company-1';

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return grouped permissions', async () => {
      const permissions = [
        { code: 'company.read', description: 'Visualizar empresa' },
        { code: 'company.update', description: 'Editar empresa' },
        { code: 'users.read', description: 'Visualizar usuários' },
      ];
      mockPrismaService.permission.findMany.mockResolvedValue(permissions);

      const result = await service.findAll();

      expect(mockPrismaService.permission.findMany).toHaveBeenCalledWith({
        orderBy: { code: 'asc' },
      });
      expect(result).toHaveLength(2);
      const companyGroup = result.find((g) => g.domain === 'company');
      const usersGroup = result.find((g) => g.domain === 'users');
      expect(companyGroup).toBeDefined();
      expect(companyGroup!.permissions).toHaveLength(2);
      expect(usersGroup).toBeDefined();
      expect(usersGroup!.permissions).toHaveLength(1);
    });
  });

  describe('findByRole', () => {
    it('should return the whole catalog for OWNER', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'company.read' },
        { code: 'purchases.delete' },
      ]);

      const result = await service.findByRole(COMPANY_ID, MembershipRole.OWNER);

      expect(result).toEqual(['company.read', 'purchases.delete']);
      expect(
        mockPrismaService.companyRolePermission.findMany,
      ).not.toHaveBeenCalled();
    });

    it('should return company scoped permissions for MEMBER', async () => {
      mockPrismaService.companyRolePermission.findMany.mockResolvedValue([
        { permissionCode: 'company.read' },
        { permissionCode: 'products.read' },
      ]);

      const result = await service.findByRole(
        COMPANY_ID,
        MembershipRole.MEMBER,
      );

      expect(
        mockPrismaService.companyRolePermission.findMany,
      ).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, role: MembershipRole.MEMBER },
        select: { permissionCode: true },
        orderBy: { permissionCode: 'asc' },
      });
      expect(result).toEqual(['company.read', 'products.read']);
    });

    it('should not leak permissions from another company', async () => {
      mockPrismaService.companyRolePermission.findMany.mockResolvedValue([]);

      const result = await service.findByRole(
        'company-2',
        MembershipRole.MEMBER,
      );

      expect(
        mockPrismaService.companyRolePermission.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-2', role: MembershipRole.MEMBER },
        }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateRolePermissions', () => {
    it('should replace MEMBER permissions within the company', async () => {
      const codes = ['company.read', 'products.read'];
      mockPrismaService.permission.findMany.mockResolvedValue(
        codes.map((code) => ({ code })),
      );
      mockPrismaService.$transaction.mockImplementation((ops: Promise<any>[]) =>
        Promise.all(ops),
      );

      const result = await service.updateRolePermissions(
        COMPANY_ID,
        MembershipRole.MEMBER,
        codes,
      );

      expect(
        mockPrismaService.companyRolePermission.deleteMany,
      ).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, role: MembershipRole.MEMBER },
      });
      expect(
        mockPrismaService.companyRolePermission.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            companyId: COMPANY_ID,
            role: MembershipRole.MEMBER,
            permissionCode: 'company.read',
          },
          {
            companyId: COMPANY_ID,
            role: MembershipRole.MEMBER,
            permissionCode: 'products.read',
          },
        ],
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(result).toEqual(codes);
    });

    it('should deduplicate repeated codes', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'products.read' },
      ]);
      mockPrismaService.$transaction.mockImplementation((ops: Promise<any>[]) =>
        Promise.all(ops),
      );

      const result = await service.updateRolePermissions(
        COMPANY_ID,
        MembershipRole.MEMBER,
        ['products.read', 'products.read'],
      );

      expect(result).toEqual(['products.read']);
      expect(
        mockPrismaService.companyRolePermission.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            companyId: COMPANY_ID,
            role: MembershipRole.MEMBER,
            permissionCode: 'products.read',
          },
        ],
      });
    });

    it('should accept an empty list', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockImplementation((ops: Promise<any>[]) =>
        Promise.all(ops),
      );

      const result = await service.updateRolePermissions(
        COMPANY_ID,
        MembershipRole.MEMBER,
        [],
      );

      expect(result).toEqual([]);
      expect(
        mockPrismaService.companyRolePermission.deleteMany,
      ).toHaveBeenCalled();
    });

    it('should throw BadRequestException for OWNER', async () => {
      await expect(
        service.updateRolePermissions(COMPANY_ID, MembershipRole.OWNER, [
          'company.read',
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for ADMIN', async () => {
      await expect(
        service.updateRolePermissions(COMPANY_ID, MembershipRole.ADMIN, [
          'company.read',
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid permission code', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'company.read' },
      ]);

      await expect(
        service.updateRolePermissions(COMPANY_ID, MembershipRole.MEMBER, [
          'company.read',
          'invalid.code',
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
