import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManageMember } from '../common/utils/role-hierarchy';
import { CreatePermissionProfileDto } from './dto/create-permission-profile.dto';
import { UpdatePermissionProfileDto } from './dto/update-permission-profile.dto';

export interface PermissionProfileResponse {
  id: string;
  name: string;
  description: string | null;
  permissionCodes: string[];
  membersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipProfileSummary {
  id: string;
  name: string;
  description: string | null;
}

interface ProfileWithRelations {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permissionCode: string }[];
  _count: { memberships: number };
}

const PROFILE_INCLUDE = {
  permissions: {
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  },
  _count: { select: { memberships: true } },
} as const;

function toResponse(profile: ProfileWithRelations): PermissionProfileResponse {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    permissionCodes: profile.permissions.map((p) => p.permissionCode),
    membersCount: profile._count.memberships,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

@Injectable()
export class PermissionProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string): Promise<PermissionProfileResponse[]> {
    const profiles = await this.prisma.permissionProfile.findMany({
      where: { companyId },
      include: PROFILE_INCLUDE,
      orderBy: { name: 'asc' },
    });

    return profiles.map(toResponse);
  }

  async findOne(
    id: string,
    companyId: string,
  ): Promise<PermissionProfileResponse> {
    const profile = await this.prisma.permissionProfile.findFirst({
      where: { id, companyId },
      include: PROFILE_INCLUDE,
    });

    if (!profile) {
      throw new NotFoundException('Perfil de permissão não encontrado');
    }

    return toResponse(profile);
  }

  async create(
    companyId: string,
    dto: CreatePermissionProfileDto,
  ): Promise<PermissionProfileResponse> {
    const codes = await this.validatePermissionCodes(dto.permissionCodes);
    await this.assertNameIsAvailable(companyId, dto.name);

    const profile = await this.prisma.permissionProfile.create({
      data: {
        companyId,
        name: dto.name,
        description: normalizeDescription(dto.description) ?? null,
        permissions: {
          create: codes.map((permissionCode) => ({ permissionCode })),
        },
      },
      include: PROFILE_INCLUDE,
    });

    return toResponse(profile);
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdatePermissionProfileDto,
  ): Promise<PermissionProfileResponse> {
    const profile = await this.prisma.permissionProfile.findFirst({
      where: { id, companyId },
      select: { id: true, name: true },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de permissão não encontrado');
    }

    if (dto.name !== undefined && dto.name !== profile.name) {
      await this.assertNameIsAvailable(companyId, dto.name);
    }

    const codes =
      dto.permissionCodes === undefined
        ? null
        : await this.validatePermissionCodes(dto.permissionCodes);

    await this.prisma.$transaction(async (tx) => {
      await tx.permissionProfile.update({
        where: { id },
        data: {
          name: dto.name,
          description: normalizeDescription(dto.description),
        },
      });

      if (codes === null) {
        return;
      }

      // Substituição total da lista, mesmo padrão do PATCH /permissions/:role
      await tx.permissionProfilePermission.deleteMany({
        where: { profileId: id },
      });

      if (codes.length > 0) {
        await tx.permissionProfilePermission.createMany({
          data: codes.map((permissionCode) => ({
            profileId: id,
            permissionCode,
          })),
        });
      }
    });

    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const profile = await this.prisma.permissionProfile.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de permissão não encontrado');
    }

    // O cascade em membership_profiles desvincula o perfil de todos os membros
    await this.prisma.permissionProfile.delete({ where: { id } });
  }

  async findMembershipProfiles(
    membershipId: string,
    companyId: string,
  ): Promise<MembershipProfileSummary[]> {
    await this.findMembership(membershipId, companyId);

    const links = await this.prisma.membershipProfile.findMany({
      where: { membershipId },
      select: {
        profile: { select: { id: true, name: true, description: true } },
      },
      orderBy: { profile: { name: 'asc' } },
    });

    return links.map((link) => link.profile);
  }

  async setMembershipProfiles(
    membershipId: string,
    companyId: string,
    profileIds: string[],
    actorRole: MembershipRole,
  ): Promise<MembershipProfileSummary[]> {
    const membership = await this.findMembership(membershipId, companyId);

    assertCanManageMember(actorRole, membership.role);

    if (membership.role !== MembershipRole.MEMBER) {
      throw new ConflictException(
        'Perfis de permissão só podem ser vinculados a usuários com papel MEMBER',
      );
    }

    const ids = [...new Set(profileIds)];
    await this.assertProfilesBelongToCompany(ids, companyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.membershipProfile.deleteMany({ where: { membershipId } });

      if (ids.length > 0) {
        await tx.membershipProfile.createMany({
          data: ids.map((profileId) => ({ membershipId, profileId })),
        });
      }
    });

    return this.findMembershipProfiles(membershipId, companyId);
  }

  private async findMembership(id: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, role: true },
    });

    if (!membership) {
      throw new NotFoundException('Associação não encontrada');
    }

    return membership;
  }

  private async assertProfilesBelongToCompany(
    ids: string[],
    companyId: string,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const profiles = await this.prisma.permissionProfile.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    });

    const found = new Set(profiles.map((p) => p.id));
    const invalid = ids.filter((id) => !found.has(id));

    if (invalid.length > 0) {
      throw new UnprocessableEntityException(
        `Perfil não encontrado nesta empresa: ${invalid.join(', ')}`,
      );
    }
  }

  private async validatePermissionCodes(
    permissionCodes: string[],
  ): Promise<string[]> {
    const codes = [...new Set(permissionCodes)].sort();

    if (codes.length === 0) {
      return codes;
    }

    const existing = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });

    const valid = new Set(existing.map((p) => p.code));
    const invalid = codes.filter((code) => !valid.has(code));

    if (invalid.length > 0) {
      throw new UnprocessableEntityException(
        `Permissão não encontrada: ${invalid.join(', ')}`,
      );
    }

    return codes;
  }

  private async assertNameIsAvailable(
    companyId: string,
    name: string,
  ): Promise<void> {
    const duplicate = await this.prisma.permissionProfile.findFirst({
      where: { companyId, name },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Já existe um perfil com este nome');
    }
  }
}

function normalizeDescription(description?: string): string | null | undefined {
  if (description === undefined) {
    return undefined;
  }

  return description.trim() === '' ? null : description;
}
