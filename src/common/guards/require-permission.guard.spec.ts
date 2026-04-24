import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { RequirePermissionGuard } from './require-permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

function createMockContext(
  membership?: { id: string; role: MembershipRole; companyId: string },
): ExecutionContext {
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
            rolePermission: {
              findMany: jest.fn(),
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

  it('should allow OWNER to create users', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');
    jest.spyOn(prismaService.rolePermission, 'findMany').mockResolvedValue([
      { permissionCode: 'users.create' },
      { permissionCode: 'users.list' },
    ] as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.OWNER,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow ADMIN to create users', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');
    jest.spyOn(prismaService.rolePermission, 'findMany').mockResolvedValue([
      { permissionCode: 'users.create' },
      { permissionCode: 'users.list' },
    ] as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.ADMIN,
      companyId: 'company-1',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should deny MEMBER from creating users', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.create');
    jest.spyOn(prismaService.rolePermission, 'findMany').mockResolvedValue([
      { permissionCode: 'users.list' },
      { permissionCode: 'products.read' },
    ] as any);

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
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sales.cancel');
    jest
      .spyOn(prismaService.rolePermission, 'findMany')
      .mockResolvedValue([{ permissionCode: 'sales.read' }] as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.MEMBER,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Sem permissão para acessar: sales.cancel'),
    );
  });

  it('should query rolePermission with correct role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users.list');
    const findManySpy = jest
      .spyOn(prismaService.rolePermission, 'findMany')
      .mockResolvedValue([{ permissionCode: 'users.list' }] as any);

    const context = createMockContext({
      id: 'membership-1',
      role: MembershipRole.ADMIN,
      companyId: 'company-1',
    });

    await guard.canActivate(context);

    expect(findManySpy).toHaveBeenCalledWith({
      where: { role: MembershipRole.ADMIN },
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
