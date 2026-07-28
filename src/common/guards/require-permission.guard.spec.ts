import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { RequirePermissionGuard } from './require-permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

function createMockContext(membership?: {
  id: string;
  role: MembershipRole;
  companyId: string;
}): ExecutionContext {
  const request = {
    membership,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RequirePermissionGuard', () => {
  let guard: RequirePermissionGuard;
  let reflector: Reflector;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequirePermissionGuard,
        Reflector,
        {
          provide: PrismaService,
          useValue: {
            companyRolePermission: {
              findFirst: jest.fn(),
            },
            permissionProfilePermission: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    guard = module.get<RequirePermissionGuard>(RequirePermissionGuard);
    reflector = module.get<Reflector>(Reflector);
    prismaService = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should allow when no permission metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when membership is not found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');

    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow OWNER without querying the database', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('purchases.delete');
    const findFirstSpy = jest.spyOn(
      prismaService.companyRolePermission,
      'findFirst',
    );

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.OWNER,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(findFirstSpy).not.toHaveBeenCalled();
  });

  it('should allow ADMIN when the permission is granted in the company', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue({ permissionCode: 'users.create' } as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.ADMIN,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should deny MEMBER when the permission is not granted', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue(null);
    jest
      .spyOn(prismaService.permissionProfilePermission, 'findFirst')
      .mockResolvedValue(null);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException with correct message when permission is denied', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('products.delete');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue(null);
    jest
      .spyOn(prismaService.permissionProfilePermission, 'findFirst')
      .mockResolvedValue(null);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Sem permissão para acessar: products.delete'),
    );
  });

  it('should allow MEMBER when the permission comes from a linked profile', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('stock.create');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue(null);
    const profileSpy = jest
      .spyOn(prismaService.permissionProfilePermission, 'findFirst')
      .mockResolvedValue({ permissionCode: 'stock.create' } as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(profileSpy).toHaveBeenCalledWith({
      where: {
        permissionCode: 'stock.create',
        profile: {
          companyId: 'company-1',
          memberships: { some: { membershipId: 'membership-1' } },
        },
      },
      select: { permissionCode: true },
    });
  });

  it('should not look at profiles when the role already grants the permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('products.list');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue({ permissionCode: 'products.list' } as any);
    const profileSpy = jest.spyOn(
      prismaService.permissionProfilePermission,
      'findFirst',
    );

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(profileSpy).not.toHaveBeenCalled();
  });

  it('should not consider profiles for ADMIN', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('stock.create');
    jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue(null);
    const profileSpy = jest.spyOn(
      prismaService.permissionProfilePermission,
      'findFirst',
    );

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.ADMIN,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(profileSpy).not.toHaveBeenCalled();
  });

  it('should scope the lookup to the active company and role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.list');
    const findFirstSpy = jest
      .spyOn(prismaService.companyRolePermission, 'findFirst')
      .mockResolvedValue({ permissionCode: 'users.list' } as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.ADMIN,
      companyId: 'company-1',
    });

    await guard.canActivate(context);

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        role: MembershipRole.ADMIN,
        permissionCode: 'users.list',
      },
      select: { permissionCode: true },
    });
  });

  it('should use PERMISSION_KEY when calling reflector', async () => {
    const getAllAndOverrideSpy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    await guard.canActivate(context);

    expect(getAllAndOverrideSpy).toHaveBeenCalledWith(
      PERMISSION_KEY,
      expect.any(Array),
    );
  });
});
