import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CompanyTenantGuard } from './company-tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
  },
};

function createMockContext(userId: string, requestOverrides: Record<string, unknown> = {}): ExecutionContext {
  const request = {
    user: { id: userId },
    ...requestOverrides,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('CompanyTenantGuard', () => {
  let guard: CompanyTenantGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyTenantGuard,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    guard = module.get<CompanyTenantGuard>(CompanyTenantGuard);
    jest.clearAllMocks();
  });

  it('should throw ForbiddenException if user has no companyActiveId', async () => {
    mockPrismaService.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyActiveId: null,
      memberships: [],
    });

    const context = createMockContext('user-1');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user has no membership for active company', async () => {
    mockPrismaService.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyActiveId: 'company-1',
      memberships: [
        { id: 'm1', companyId: 'company-2', role: MembershipRole.MEMBER },
      ],
    });

    const context = createMockContext('user-1');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should set request.companyId and request.membership on success', async () => {
    mockPrismaService.user.findFirst.mockResolvedValue({
      id: 'user-1',
      companyActiveId: 'company-1',
      memberships: [
        { id: 'm1', companyId: 'company-1', role: MembershipRole.OWNER },
      ],
    });

    const request: Record<string, unknown> = { user: { id: 'user-1' } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.companyId).toBe('company-1');
    expect(request.membership).toEqual({
      id: 'm1',
      role: MembershipRole.OWNER,
      companyId: 'company-1',
    });
  });
});
