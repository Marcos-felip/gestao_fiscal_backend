import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  permission: {
    findMany: jest.fn(),
  },
  rolePermission: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

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
    it('should return all permissions for OWNER', async () => {
      const rolePermissions = [
        { permissionCode: 'company.read' },
        { permissionCode: 'company.update' },
      ];
      mockPrismaService.rolePermission.findMany.mockResolvedValue(rolePermissions);

      const result = await service.findByRole('OWNER');

      expect(mockPrismaService.rolePermission.findMany).toHaveBeenCalledWith({
        where: { role: 'OWNER' },
        select: { permissionCode: true },
        orderBy: { permissionCode: 'asc' },
      });
      expect(result).toEqual(['company.read', 'company.update']);
    });

    it('should return specific permissions for MEMBER', async () => {
      const rolePermissions = [
        { permissionCode: 'company.read' },
        { permissionCode: 'products.read' },
      ];
      mockPrismaService.rolePermission.findMany.mockResolvedValue(rolePermissions);

      const result = await service.findByRole('MEMBER');

      expect(mockPrismaService.rolePermission.findMany).toHaveBeenCalledWith({
        where: { role: 'MEMBER' },
        select: { permissionCode: true },
        orderBy: { permissionCode: 'asc' },
      });
      expect(result).toEqual(['company.read', 'products.read']);
    });
  });

  describe('updateRolePermissions', () => {
    it('should replace MEMBER permissions', async () => {
      const codes = ['company.read', 'products.read'];
      mockPrismaService.permission.findMany.mockResolvedValue(
        codes.map((code) => ({ code })),
      );
      mockPrismaService.$transaction.mockImplementation((ops: Promise<any>[]) =>
        Promise.all(ops),
      );

      const result = await service.updateRolePermissions('MEMBER', codes);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(result).toEqual(codes);
    });

    it('should throw BadRequestException for OWNER', async () => {
      await expect(
        service.updateRolePermissions('OWNER', ['company.read']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for ADMIN', async () => {
      await expect(
        service.updateRolePermissions('ADMIN', ['company.read']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid permission code', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'company.read' },
      ]);

      await expect(
        service.updateRolePermissions('MEMBER', ['company.read', 'invalid.code']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});