import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
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

      await expect(service.getProfile('unknown')).rejects.toThrow(
        NotFoundException,
      );
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

  describe('createUser', () => {
    it('should throw ForbiddenException when companyId is not the active company', async () => {
      await expect(
        service.createUser(
          {
            email: 'newuser@example.com',
            role: MembershipRole.MEMBER,
            companyId: 'another-company',
          },
          'company-1',
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.company.findFirst).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when assigning OWNER', async () => {
      await expect(
        service.createUser(
          {
            email: 'newuser@example.com',
            role: MembershipRole.OWNER,
            companyId: 'company-1',
          },
          'company-1',
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when MEMBER assigns ADMIN', async () => {
      await expect(
        service.createUser(
          {
            email: 'newuser@example.com',
            role: MembershipRole.ADMIN,
            companyId: 'company-1',
          },
          'company-1',
          MembershipRole.MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(
        service.createUser(
          {
            email: 'newuser@example.com',
            role: MembershipRole.MEMBER,
            companyId: 'company-1',
          },
          'company-1',
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Test Company',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'existing@example.com',
      });

      await expect(
        service.createUser(
          {
            email: 'existing@example.com',
            role: MembershipRole.MEMBER,
            companyId: 'company-1',
          },
          'company-1',
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user with MEMBER role successfully', async () => {
      const newUserId = 'new-user-123';
      const newEmail = 'newuser@example.com';

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Test Company',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: newUserId,
        email: newEmail,
        createdAt: new Date(),
        memberships: [
          {
            role: 'MEMBER',
            companyId: 'company-1',
          },
        ],
      });

      const result = await service.createUser(
        {
          email: newEmail,
          role: MembershipRole.MEMBER,
          companyId: 'company-1',
        },
        'company-1',
        MembershipRole.OWNER,
      );

      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(newEmail);
      expect(result.role).toBe('MEMBER');
      expect(result.companyId).toBe('company-1');
      expect(result.temporaryPassword).toBeDefined();
    });

    it('should create user with ADMIN role successfully', async () => {
      const newUserId = 'new-user-456';
      const newEmail = 'admin@example.com';

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Test Company',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: newUserId,
        email: newEmail,
        createdAt: new Date(),
        memberships: [
          {
            role: 'ADMIN',
            companyId: 'company-1',
          },
        ],
      });

      const result = await service.createUser(
        {
          email: newEmail,
          role: MembershipRole.ADMIN,
          companyId: 'company-1',
        },
        'company-1',
        MembershipRole.OWNER,
      );

      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(newEmail);
      expect(result.role).toBe('ADMIN');
    });

    it('should call user.create with correct structure', async () => {
      const newEmail = 'test@example.com';

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user',
        email: newEmail,
        createdAt: new Date(),
        memberships: [{ role: 'MEMBER', companyId: 'company-1' }],
      });

      await service.createUser(
        {
          email: newEmail,
          role: MembershipRole.MEMBER,
          companyId: 'company-1',
        },
        'company-1',
        MembershipRole.OWNER,
      );

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          name: 'test',
          email: newEmail,
          passwordHash: expect.any(String),
          forcePasswordChange: true,
          memberships: {
            create: {
              companyId: 'company-1',
              role: 'MEMBER',
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          memberships: {
            select: {
              role: true,
              companyId: true,
            },
          },
        },
      });
    });
  });

  describe('addMembership', () => {
    it('should add existing user to company successfully', async () => {
      const userId = 'user-1';
      const companyId = 'company-1';

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        name: 'Test User',
      });

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: companyId,
        name: 'Test Company',
      });

      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      mockPrismaService.membership.create.mockResolvedValue({
        id: 'membership-1',
        userId,
        companyId,
        role: 'MEMBER',
        createdAt: new Date(),
      });

      const result = await service.addMembership(
        userId,
        companyId,
        { role: MembershipRole.MEMBER },
        MembershipRole.OWNER,
      );

      expect(result.id).toBe('membership-1');
      expect(result.userId).toBe(userId);
      expect(result.companyId).toBe(companyId);
      expect(result.role).toBe('MEMBER');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.addMembership(
          'unknown-user',
          'company-1',
          { role: MembershipRole.MEMBER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if company not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      mockPrismaService.company.findFirst.mockResolvedValue(null);

      await expect(
        service.addMembership(
          'user-1',
          'unknown-company',
          { role: MembershipRole.MEMBER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already is member', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Test Company',
      });

      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-1',
        companyId: 'company-1',
        role: 'MEMBER',
      });

      await expect(
        service.addMembership(
          'user-1',
          'company-1',
          { role: MembershipRole.MEMBER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should add user with ADMIN role', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-2',
        email: 'admin@example.com',
      });

      mockPrismaService.company.findFirst.mockResolvedValue({
        id: 'company-1',
      });

      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      mockPrismaService.membership.create.mockResolvedValue({
        id: 'membership-2',
        userId: 'user-2',
        companyId: 'company-1',
        role: 'ADMIN',
        createdAt: new Date(),
      });

      const result = await service.addMembership(
        'user-2',
        'company-1',
        { role: MembershipRole.ADMIN },
        MembershipRole.OWNER,
      );

      expect(result.role).toBe('ADMIN');
    });

    it('should reject adding a membership as OWNER', async () => {
      await expect(
        service.addMembership(
          'user-2',
          'company-1',
          { role: MembershipRole.OWNER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.membership.create).not.toHaveBeenCalled();
    });

    it('should reject a MEMBER adding an ADMIN', async () => {
      await expect(
        service.addMembership(
          'user-2',
          'company-1',
          { role: MembershipRole.ADMIN },
          MembershipRole.MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateUserByAdmin', () => {
    const targetUser = {
      id: 'user-2',
      name: 'Maria',
      email: 'maria@exemplo.com',
      deletedAt: null,
    };

    it('should throw NotFoundException when the user is not a member of the company', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.updateUserByAdmin(
          'user-2',
          'company-1',
          { name: 'Maria Souza' },
          MembershipRole.ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should let an ADMIN edit a MEMBER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(targetUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...targetUser,
        name: 'Maria Souza',
      });

      const result = await service.updateUserByAdmin(
        'user-2',
        'company-1',
        { name: 'Maria Souza' },
        MembershipRole.ADMIN,
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-2' },
          data: { name: 'Maria Souza' },
        }),
      );
      expect(result.name).toBe('Maria Souza');
    });

    it('should let an ADMIN edit another ADMIN', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.ADMIN,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(targetUser);
      mockPrismaService.user.update.mockResolvedValue(targetUser);

      await service.updateUserByAdmin(
        'user-2',
        'company-1',
        { name: 'Outro Admin' },
        MembershipRole.ADMIN,
      );

      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should block an ADMIN from editing the OWNER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.OWNER,
      });

      await expect(
        service.updateUserByAdmin(
          'user-2',
          'company-1',
          { email: 'novo@exemplo.com' },
          MembershipRole.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the e-mail belongs to another user', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.user.findFirst
        .mockResolvedValueOnce(targetUser)
        .mockResolvedValueOnce({ id: 'user-9', email: 'usado@exemplo.com' });

      await expect(
        service.updateUserByAdmin(
          'user-2',
          'company-1',
          { email: 'usado@exemplo.com' },
          MembershipRole.ADMIN,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should not check uniqueness when the e-mail is unchanged', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(targetUser);
      mockPrismaService.user.update.mockResolvedValue(targetUser);

      await service.updateUserByAdmin(
        'user-2',
        'company-1',
        { email: targetUser.email },
        MembershipRole.ADMIN,
      );

      // apenas a busca do próprio usuário
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should not change the role', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.user.findFirst
        .mockResolvedValueOnce(targetUser)
        .mockResolvedValueOnce(null);
      mockPrismaService.user.update.mockResolvedValue(targetUser);

      await service.updateUserByAdmin(
        'user-2',
        'company-1',
        { name: 'Maria Souza', email: 'maria2@exemplo.com' },
        MembershipRole.ADMIN,
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-2' },
          data: { name: 'Maria Souza', email: 'maria2@exemplo.com' },
        }),
      );
      expect(mockPrismaService.membership.update).not.toHaveBeenCalled();
    });
  });
});
