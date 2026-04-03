import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user without sensitive fields', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        companyActiveId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        memberships: [{ id: 'm1' }, { id: 'm2' }],
      });

      const result = await service.getProfile('user-1');

      expect(result.id).toBe('user-1');
      expect(result.name).toBe('Test User');
      expect(result.membershipsCount).toBe(2);
      expect((result as any).memberships).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update name and email', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        name: 'Old Name',
        email: 'old@example.com',
        companyActiveId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        memberships: [],
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-1',
        name: 'New Name',
        email: 'new@example.com',
        companyActiveId: null,
        updatedAt: new Date(),
      });

      const result = await service.updateProfile('user-1', {
        name: 'New Name',
        email: 'new@example.com',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { name: 'New Name', email: 'new@example.com' },
        }),
      );
      expect(result.name).toBe('New Name');
    });
  });

  describe('updateActiveCompany', () => {
    it('should throw ForbiddenException if no membership found', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.updateActiveCompany('user-1', { companyId: 'company-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update companyActiveId on success', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        companyActiveId: 'company-1',
        updatedAt: new Date(),
      });

      const result = await service.updateActiveCompany('user-1', {
        companyId: 'company-1',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { companyActiveId: 'company-1' },
        }),
      );
      expect(result.companyActiveId).toBe('company-1');
    });
  });
});
