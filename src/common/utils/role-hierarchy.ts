import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

/**
 * Hierarquia dos papéis. Quanto maior o número, maior o nível de acesso.
 */
export const ROLE_RANK: Record<MembershipRole, number> = {
  [MembershipRole.OWNER]: 3,
  [MembershipRole.ADMIN]: 2,
  [MembershipRole.MEMBER]: 1,
};

/**
 * Valida se `actorRole` pode atribuir `targetRole` a outro usuário.
 *
 * Regras:
 * - O papel OWNER nunca é atribuível pela API (nasce com a criação da empresa)
 * - Ninguém pode atribuir um papel superior ao seu próprio
 */
export function assertCanAssignRole(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
): void {
  if (targetRole === MembershipRole.OWNER) {
    throw new ForbiddenException(
      'Não é possível atribuir o papel OWNER a um usuário',
    );
  }

  if (ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) {
    throw new ForbiddenException(
      'Não é possível atribuir um papel superior ao seu',
    );
  }
}

/**
 * Valida se `actorRole` pode gerenciar (editar ou remover) um membro cujo
 * papel é `targetRole`.
 *
 * Regra: ninguém gerencia um usuário de papel superior ao seu.
 * Papéis de mesmo nível podem se gerenciar (ex: ADMIN remove ADMIN).
 */
export function assertCanManageMember(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
): void {
  if (ROLE_RANK[targetRole] > ROLE_RANK[actorRole]) {
    throw new ForbiddenException(
      'Não é possível gerenciar um usuário de papel superior ao seu',
    );
  }
}
