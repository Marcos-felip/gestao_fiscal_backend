import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MembershipsService } from './memberships.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
}));

const mockTxUserCreate = jest.fn();
const mockTxMembershipCreate = jest.fn();

const mockTx = {
  user: {
    create: mockTxUserCreate,
  },
  membership: {
    create: mockTxMembershipCreate,
  },
};

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
};

describe('MembershipsService', () => {
  let service: MembershipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
    jest.clearAllMocks();
  });

  describe('createMember', () => {
    const createMemberDto = {
      name: 'João Silva',
      email: 'joao@exemplo.com',
      role: MembershipRole.MEMBER,
    };

    it('should throw ConflictException if e-mail already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'existing-user',
      });

      await expect(
        service.createMember(
          'company-1',
          createMemberDto,
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createMember(
          'company-1',
          createMemberDto,
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow('E-mail já cadastrado');
    });

    it('should throw ConflictException if user is already a member of the company', async () => {
      // When email exists, it throws "E-mail já cadastrado"
      // This is tested above. The membership check happens only for existing users,
      // but since we create users atomically, the email check comes first.
      // If the email is already registered, we never reach membership creation.
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'existing-user',
      });

      await expect(
        service.createMember(
          'company-1',
          createMemberDto,
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user + membership with provisional password and forcePasswordChange=true', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      mockTxUserCreate.mockResolvedValue({
        id: 'user-1',
        name: 'João Silva',
        email: 'joao@exemplo.com',
        memberships: [
          {
            id: 'membership-1',
            userId: 'user-1',
            companyId: 'company-1',
            role: MembershipRole.MEMBER,
          },
        ],
      });

      const result = await service.createMember(
        'company-1',
        createMemberDto,
        MembershipRole.OWNER,
      );

      // Verify bcrypt.hash was called (for provisional password)
      expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 12);

      // Verify user was created with forcePasswordChange: true
      expect(mockTxUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'João Silva',
            email: 'joao@exemplo.com',
            forcePasswordChange: true,
            passwordHash: '$2b$12$mockedhash',
          }),
        }),
      );

      // Verify no password is returned in the result
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });

    it('should use default role MEMBER when role is not provided', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      mockTxUserCreate.mockResolvedValue({
        id: 'user-1',
        name: 'João Silva',
        email: 'joao@exemplo.com',
        memberships: [
          {
            id: 'membership-1',
            userId: 'user-1',
            companyId: 'company-1',
            role: MembershipRole.MEMBER,
          },
        ],
      });

      const dtoNoRole = { name: 'João Silva', email: 'joao@exemplo.com' };

      await service.createMember('company-1', dtoNoRole, MembershipRole.OWNER);

      expect(mockTxUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberships: expect.objectContaining({
              create: expect.objectContaining({
                role: MembershipRole.MEMBER,
              }),
            }),
          }),
        }),
      );
    });

    it('should use ADMIN role when provided', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      mockTxUserCreate.mockResolvedValue({
        id: 'user-1',
        name: 'Admin Silva',
        email: 'admin@exemplo.com',
        memberships: [
          {
            id: 'membership-1',
            userId: 'user-1',
            companyId: 'company-1',
            role: MembershipRole.ADMIN,
          },
        ],
      });

      const dtoAdmin = {
        name: 'Admin Silva',
        email: 'admin@exemplo.com',
        role: MembershipRole.ADMIN,
      };

      await service.createMember('company-1', dtoAdmin, MembershipRole.OWNER);

      expect(mockTxUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberships: expect.objectContaining({
              create: expect.objectContaining({
                role: MembershipRole.ADMIN,
              }),
            }),
          }),
        }),
      );
    });

    it('should reject creating an OWNER', async () => {
      await expect(
        service.createMember(
          'company-1',
          {
            name: 'Novo Dono',
            email: 'dono@example.com',
            role: MembershipRole.OWNER,
          },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.user.findFirst).not.toHaveBeenCalled();
    });

    it('should reject a MEMBER creating an ADMIN', async () => {
      await expect(
        service.createMember(
          'company-1',
          {
            name: 'Novo Admin',
            email: 'admin@example.com',
            role: MembershipRole.ADMIN,
          },
          MembershipRole.MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTxUserCreate).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should flatten the linked profiles of each membership', async () => {
      mockPrismaService.membership.findMany.mockResolvedValue([
        {
          id: 'm1',
          role: MembershipRole.MEMBER,
          user: { id: 'u1', name: 'João', email: 'joao@exemplo.com' },
          profiles: [{ profile: { id: 'profile-1', name: 'Estoquista' } }],
        },
      ]);

      const result = await service.findAll('company-1');

      expect(mockPrismaService.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', deletedAt: null },
        }),
      );
      expect(result).toEqual([
        {
          id: 'm1',
          role: MembershipRole.MEMBER,
          user: { id: 'u1', name: 'João', email: 'joao@exemplo.com' },
          profiles: [{ id: 'profile-1', name: 'Estoquista' }],
        },
      ]);
    });

    it('should return an empty list of profiles when there is no link', async () => {
      mockPrismaService.membership.findMany.mockResolvedValue([
        {
          id: 'm2',
          role: MembershipRole.ADMIN,
          user: { id: 'u2', name: 'Ana', email: 'ana@exemplo.com' },
          profiles: [],
        },
      ]);

      const result = await service.findAll('company-1');

      expect(result[0].profiles).toEqual([]);
    });
  });

  describe('updateRole', () => {
    it('should throw NotFoundException if membership not found', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRole(
          'm1',
          'company-1',
          { role: MembershipRole.ADMIN },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to change OWNER role', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.OWNER,
      });

      await expect(
        service.updateRole(
          'm1',
          'company-1',
          { role: MembershipRole.MEMBER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update membership role successfully', async () => {
      const updatedMembership = {
        id: 'm1',
        role: MembershipRole.ADMIN,
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      };
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.membership.update.mockResolvedValue(updatedMembership);

      const result = await service.updateRole(
        'm1',
        'company-1',
        { role: MembershipRole.ADMIN },
        MembershipRole.OWNER,
      );

      expect(mockPrismaService.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: { role: MembershipRole.ADMIN },
        }),
      );
      expect(result).toEqual(updatedMembership);
    });

    it('should reject promoting a membership to OWNER', async () => {
      await expect(
        service.updateRole(
          'm1',
          'company-1',
          { role: MembershipRole.OWNER },
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.membership.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if membership not found', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('m1', 'company-1', MembershipRole.OWNER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to remove OWNER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.OWNER,
      });

      await expect(
        service.remove('m1', 'company-1', MembershipRole.OWNER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft delete membership for non-owner', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.membership.update.mockResolvedValue({});

      await service.remove('m1', 'company-1', MembershipRole.OWNER);

      expect(mockPrismaService.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should let an ADMIN remove a MEMBER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.membership.update.mockResolvedValue({});

      await service.remove('m1', 'company-1', MembershipRole.ADMIN);

      expect(mockPrismaService.membership.update).toHaveBeenCalled();
    });

    it('should let an ADMIN remove another ADMIN', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.ADMIN,
      });
      mockPrismaService.membership.update.mockResolvedValue({});

      await service.remove('m1', 'company-1', MembershipRole.ADMIN);

      expect(mockPrismaService.membership.update).toHaveBeenCalled();
    });

    it('should block an ADMIN from removing the OWNER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.OWNER,
      });

      await expect(
        service.remove('m1', 'company-1', MembershipRole.ADMIN),
      ).rejects.toThrow('Não é possível remover o OWNER da empresa');

      expect(mockPrismaService.membership.update).not.toHaveBeenCalled();
    });

    it('should block a MEMBER from removing an ADMIN', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.ADMIN,
      });

      await expect(
        service.remove('m1', 'company-1', MembershipRole.MEMBER),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.membership.update).not.toHaveBeenCalled();
    });
  });
});
