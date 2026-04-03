import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function createMockContext(role?: MembershipRole): ExecutionContext {
  const request = {
    membership: role ? { role } : undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  it('should allow when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when roles metadata is empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    const context = createMockContext(MembershipRole.MEMBER);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when user role matches required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MembershipRole.OWNER]);

    const context = createMockContext(MembershipRole.OWNER);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when user role is one of multiple required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([MembershipRole.OWNER, MembershipRole.ADMIN]);

    const context = createMockContext(MembershipRole.ADMIN);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny when user role does not match required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MembershipRole.OWNER]);

    const context = createMockContext(MembershipRole.MEMBER);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should deny when user has no membership role and roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([MembershipRole.OWNER]);

    const context = createMockContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should use ROLES_KEY when calling reflector', () => {
    const getAllAndOverrideSpy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);

    const context = createMockContext();
    guard.canActivate(context);

    expect(getAllAndOverrideSpy).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });
});
