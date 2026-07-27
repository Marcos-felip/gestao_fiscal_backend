import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  assertCanAssignRole,
  assertCanManageMember,
  ROLE_RANK,
} from './role-hierarchy';

describe('assertCanAssignRole', () => {
  it('should rank OWNER above ADMIN above MEMBER', () => {
    expect(ROLE_RANK[MembershipRole.OWNER]).toBeGreaterThan(
      ROLE_RANK[MembershipRole.ADMIN],
    );
    expect(ROLE_RANK[MembershipRole.ADMIN]).toBeGreaterThan(
      ROLE_RANK[MembershipRole.MEMBER],
    );
  });

  describe('allowed assignments', () => {
    const allowed: Array<[MembershipRole, MembershipRole]> = [
      [MembershipRole.OWNER, MembershipRole.ADMIN],
      [MembershipRole.OWNER, MembershipRole.MEMBER],
      [MembershipRole.ADMIN, MembershipRole.ADMIN],
      [MembershipRole.ADMIN, MembershipRole.MEMBER],
      [MembershipRole.MEMBER, MembershipRole.MEMBER],
    ];

    it.each(allowed)('%s should be able to assign %s', (actor, target) => {
      expect(() => assertCanAssignRole(actor, target)).not.toThrow();
    });
  });

  describe('blocked assignments', () => {
    const blocked: Array<[MembershipRole, MembershipRole]> = [
      [MembershipRole.OWNER, MembershipRole.OWNER],
      [MembershipRole.ADMIN, MembershipRole.OWNER],
      [MembershipRole.MEMBER, MembershipRole.OWNER],
      [MembershipRole.MEMBER, MembershipRole.ADMIN],
    ];

    it.each(blocked)('%s should not be able to assign %s', (actor, target) => {
      expect(() => assertCanAssignRole(actor, target)).toThrow(
        ForbiddenException,
      );
    });
  });

  it('should explain that OWNER is never assignable', () => {
    expect(() =>
      assertCanAssignRole(MembershipRole.OWNER, MembershipRole.OWNER),
    ).toThrow('Não é possível atribuir o papel OWNER a um usuário');
  });

  it('should explain that a higher role cannot be assigned', () => {
    expect(() =>
      assertCanAssignRole(MembershipRole.MEMBER, MembershipRole.ADMIN),
    ).toThrow('Não é possível atribuir um papel superior ao seu');
  });
});

describe('assertCanManageMember', () => {
  describe('allowed', () => {
    const allowed: Array<[MembershipRole, MembershipRole]> = [
      [MembershipRole.OWNER, MembershipRole.OWNER],
      [MembershipRole.OWNER, MembershipRole.ADMIN],
      [MembershipRole.OWNER, MembershipRole.MEMBER],
      [MembershipRole.ADMIN, MembershipRole.ADMIN],
      [MembershipRole.ADMIN, MembershipRole.MEMBER],
      [MembershipRole.MEMBER, MembershipRole.MEMBER],
    ];

    it.each(allowed)('%s should be able to manage %s', (actor, target) => {
      expect(() => assertCanManageMember(actor, target)).not.toThrow();
    });
  });

  describe('blocked', () => {
    const blocked: Array<[MembershipRole, MembershipRole]> = [
      [MembershipRole.ADMIN, MembershipRole.OWNER],
      [MembershipRole.MEMBER, MembershipRole.OWNER],
      [MembershipRole.MEMBER, MembershipRole.ADMIN],
    ];

    it.each(blocked)('%s should not be able to manage %s', (actor, target) => {
      expect(() => assertCanManageMember(actor, target)).toThrow(
        ForbiddenException,
      );
    });
  });

  it('should explain that a higher role cannot be managed', () => {
    expect(() =>
      assertCanManageMember(MembershipRole.ADMIN, MembershipRole.OWNER),
    ).toThrow('Não é possível gerenciar um usuário de papel superior ao seu');
  });
});
