import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PermissionProfilesService } from './permission-profiles.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTx = {
  permissionProfile: { update: jest.fn() },
  permissionProfilePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
  membershipProfile: { deleteMany: jest.fn(), createMany: jest.fn() },
};

const mockPrismaService = {
  $transaction: jest.fn(),
  permission: { findMany: jest.fn() },
  permissionProfile: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  membershipProfile: { findMany: jest.fn() },
  membership: { findFirst: jest.fn() },
};

const COMPANY_ID = 'company-1';

const buildProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-1',
  companyId: COMPANY_ID,
  name: 'Estoquista',
  description: 'Acesso ao estoque',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  permissions: [{ permissionCode: 'stock.create' }],
  _count: { memberships: 2 },
  ...overrides,
});

describe('PermissionProfilesService', () => {
  let service: PermissionProfilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionProfilesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PermissionProfilesService>(PermissionProfilesService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
    );
  });

  describe('findAll', () => {
    it('should list the profiles of the active company with codes and member count', async () => {
      mockPrismaService.permissionProfile.findMany.mockResolvedValue([
        buildProfile(),
      ]);

      const result = await service.findAll(COMPANY_ID);

      expect(mockPrismaService.permissionProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      );
      expect(result).toEqual([
        {
          id: 'profile-1',
          name: 'Estoquista',
          description: 'Acesso ao estoque',
          permissionCodes: ['stock.create'],
          membersCount: 2,
          createdAt: new Date('2026-07-01'),
          updatedAt: new Date('2026-07-01'),
        },
      ]);
    });
  });

  describe('findOne', () => {
    it('should scope the lookup to the active company', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(
        buildProfile(),
      );

      await service.findOne('profile-1', COMPANY_ID);

      expect(
        mockPrismaService.permissionProfile.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1', companyId: COMPANY_ID },
        }),
      );
    });

    it('should throw NotFoundException for a profile of another company', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(null);

      await expect(service.findOne('profile-1', COMPANY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create the profile with deduplicated and sorted codes', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'products.list' },
        { code: 'stock.create' },
      ]);
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(null);
      mockPrismaService.permissionProfile.create.mockResolvedValue(
        buildProfile(),
      );

      await service.create(COMPANY_ID, {
        name: 'Estoquista',
        description: 'Acesso ao estoque',
        permissionCodes: ['stock.create', 'products.list', 'stock.create'],
      });

      expect(mockPrismaService.permissionProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            companyId: COMPANY_ID,
            name: 'Estoquista',
            description: 'Acesso ao estoque',
            permissions: {
              create: [
                { permissionCode: 'products.list' },
                { permissionCode: 'stock.create' },
              ],
            },
          },
        }),
      );
    });

    it('should throw UnprocessableEntityException for a code outside the catalog', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'stock.create' },
      ]);

      await expect(
        service.create(COMPANY_ID, {
          name: 'Estoquista',
          permissionCodes: ['stock.create', 'inexistente.acao'],
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockPrismaService.permissionProfile.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the name is already used in the company', async () => {
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'stock.create' },
      ]);
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue({
        id: 'profile-9',
      });

      await expect(
        service.create(COMPANY_ID, {
          name: 'Estoquista',
          permissionCodes: ['stock.create'],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should accept an empty permission list', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(null);
      mockPrismaService.permissionProfile.create.mockResolvedValue(
        buildProfile({ permissions: [], _count: { memberships: 0 } }),
      );

      const result = await service.create(COMPANY_ID, {
        name: 'Vazio',
        permissionCodes: [],
      });

      expect(mockPrismaService.permission.findMany).not.toHaveBeenCalled();
      expect(result.permissionCodes).toEqual([]);
    });
  });

  describe('update', () => {
    it('should replace the whole permission list', async () => {
      mockPrismaService.permissionProfile.findFirst
        .mockResolvedValueOnce({ id: 'profile-1', name: 'Estoquista' })
        .mockResolvedValueOnce(buildProfile());
      mockPrismaService.permission.findMany.mockResolvedValue([
        { code: 'products.list' },
      ]);

      await service.update('profile-1', COMPANY_ID, {
        permissionCodes: ['products.list'],
      });

      expect(
        mockTx.permissionProfilePermission.deleteMany,
      ).toHaveBeenCalledWith({ where: { profileId: 'profile-1' } });
      expect(
        mockTx.permissionProfilePermission.createMany,
      ).toHaveBeenCalledWith({
        data: [{ profileId: 'profile-1', permissionCode: 'products.list' }],
      });
    });

    it('should keep the permissions untouched when permissionCodes is omitted', async () => {
      mockPrismaService.permissionProfile.findFirst
        .mockResolvedValueOnce({ id: 'profile-1', name: 'Estoquista' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildProfile({ name: 'Estoque' }));

      await service.update('profile-1', COMPANY_ID, { name: 'Estoque' });

      expect(
        mockTx.permissionProfilePermission.deleteMany,
      ).not.toHaveBeenCalled();
      expect(mockTx.permissionProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { name: 'Estoque', description: undefined },
      });
    });

    it('should throw ConflictException when renaming to an existing name', async () => {
      mockPrismaService.permissionProfile.findFirst
        .mockResolvedValueOnce({ id: 'profile-1', name: 'Estoquista' })
        .mockResolvedValueOnce({ id: 'profile-2' });

      await expect(
        service.update('profile-1', COMPANY_ID, { name: 'Comprador' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for a profile of another company', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.update('profile-1', COMPANY_ID, { name: 'Comprador' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the profile of the active company', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
      });

      await service.remove('profile-1', COMPANY_ID);

      expect(mockPrismaService.permissionProfile.delete).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
      });
    });

    it('should throw NotFoundException for a profile of another company', async () => {
      mockPrismaService.permissionProfile.findFirst.mockResolvedValue(null);

      await expect(service.remove('profile-1', COMPANY_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.permissionProfile.delete).not.toHaveBeenCalled();
    });
  });

  describe('setMembershipProfiles', () => {
    const memberMembership = {
      id: 'membership-1',
      role: MembershipRole.MEMBER,
    };

    it('should replace the set of profiles of a MEMBER', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(
        memberMembership,
      );
      mockPrismaService.permissionProfile.findMany.mockResolvedValue([
        { id: 'profile-1' },
        { id: 'profile-2' },
      ]);
      mockPrismaService.membershipProfile.findMany.mockResolvedValue([
        { profile: { id: 'profile-1', name: 'Estoquista', description: null } },
      ]);

      const result = await service.setMembershipProfiles(
        'membership-1',
        COMPANY_ID,
        ['profile-1', 'profile-2', 'profile-1'],
        MembershipRole.ADMIN,
      );

      expect(mockTx.membershipProfile.deleteMany).toHaveBeenCalledWith({
        where: { membershipId: 'membership-1' },
      });
      expect(mockTx.membershipProfile.createMany).toHaveBeenCalledWith({
        data: [
          { membershipId: 'membership-1', profileId: 'profile-1' },
          { membershipId: 'membership-1', profileId: 'profile-2' },
        ],
      });
      expect(result).toEqual([
        { id: 'profile-1', name: 'Estoquista', description: null },
      ]);
    });

    it('should unlink every profile when the list is empty', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(
        memberMembership,
      );
      mockPrismaService.membershipProfile.findMany.mockResolvedValue([]);

      const result = await service.setMembershipProfiles(
        'membership-1',
        COMPANY_ID,
        [],
        MembershipRole.OWNER,
      );

      expect(mockTx.membershipProfile.deleteMany).toHaveBeenCalled();
      expect(mockTx.membershipProfile.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should reject an ADMIN membership', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'membership-2',
        role: MembershipRole.ADMIN,
      });

      await expect(
        service.setMembershipProfiles(
          'membership-2',
          COMPANY_ID,
          ['profile-1'],
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.membershipProfile.deleteMany).not.toHaveBeenCalled();
    });

    it('should reject an OWNER membership', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'membership-3',
        role: MembershipRole.OWNER,
      });

      await expect(
        service.setMembershipProfiles(
          'membership-3',
          COMPANY_ID,
          [],
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject a profile from another company', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(
        memberMembership,
      );
      mockPrismaService.permissionProfile.findMany.mockResolvedValue([]);

      await expect(
        service.setMembershipProfiles(
          'membership-1',
          COMPANY_ID,
          ['profile-de-outra-empresa'],
          MembershipRole.ADMIN,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockPrismaService.permissionProfile.findMany).toHaveBeenCalledWith(
        {
          where: {
            id: { in: ['profile-de-outra-empresa'] },
            companyId: COMPANY_ID,
          },
          select: { id: true },
        },
      );
      expect(mockTx.membershipProfile.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for a membership of another company', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.setMembershipProfiles(
          'membership-1',
          COMPANY_ID,
          [],
          MembershipRole.OWNER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should respect the role hierarchy before anything else', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'membership-2',
        role: MembershipRole.ADMIN,
      });

      await expect(
        service.setMembershipProfiles(
          'membership-2',
          COMPANY_ID,
          ['profile-1'],
          MembershipRole.MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMembershipProfiles', () => {
    it('should return the profiles linked to the membership', async () => {
      mockPrismaService.membership.findFirst.mockResolvedValue({
        id: 'membership-1',
        role: MembershipRole.MEMBER,
      });
      mockPrismaService.membershipProfile.findMany.mockResolvedValue([
        { profile: { id: 'profile-1', name: 'Estoquista', description: null } },
      ]);

      const result = await service.findMembershipProfiles(
        'membership-1',
        COMPANY_ID,
      );

      expect(mockPrismaService.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'membership-1', companyId: COMPANY_ID, deletedAt: null },
        }),
      );
      expect(result).toEqual([
        { id: 'profile-1', name: 'Estoquista', description: null },
      ]);
    });
  });
});
