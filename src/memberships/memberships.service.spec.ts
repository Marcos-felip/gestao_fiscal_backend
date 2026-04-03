import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { PrismaService } from '../prisma/prisma.service';

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

  describe('invite', () => {
    it('should throw NotFoundException if user email not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.invite('company-1', { email: 'unknown@example.com', role: MembershipRole.MEMBER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user is already a member', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrismaService.membership.findFirst.mockResolvedValue({ id: 'm1' });

      await expect(
        service.invite('company-1', { email: 'test@example.com', role: MembershipRole.MEMBER }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create membership when user found and not already a member', async () => {
      const newMembership = {
        id: 'm1',
        userId: 'user-1',
        companyId: 'company-1',
        role: MembershipRole.MEMBER,
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      };
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrismaService.membership.findFirst.mockResolvedValue(null);
      mockPrismaService.membership.create.mockResolvedValue(newMembership);

      const result = await service.invite('company-1', {
        email: 'test@example.com',
        role: MembershipRole.MEMBER,
      });

      expect(mockPrismaService.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            companyId: 'company-1',
            role: MembershipRole.MEMBER,
          }),
        }),
      );
      expect(result).toEqual(newMembership);
    });
  });

  describe('updateRole', () => {
    it('should throw NotFoundException if membership not found', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRole('m1', 'company-1', { role: MembershipRole.ADMIN }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to change OWNER role', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.OWNER,
      });

      await expect(
        service.updateRole('m1', 'company-1', { role: MembershipRole.MEMBER }),
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

      const result = await service.updateRole('m1', 'company-1', {
        role: MembershipRole.ADMIN,
      });

      expect(mockPrismaService.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: { role: MembershipRole.ADMIN },
        }),
      );
      expect(result).toEqual(updatedMembership);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if membership not found', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(service.remove('m1', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to remove OWNER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.OWNER,
      });

      await expect(service.remove('m1', 'company-1')).rejects.toThrow(BadRequestException);
    });

    it('should soft delete membership for non-owner', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'm1',
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.membership.update.mockResolvedValue({});

      await service.remove('m1', 'company-1');

      expect(mockPrismaService.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
