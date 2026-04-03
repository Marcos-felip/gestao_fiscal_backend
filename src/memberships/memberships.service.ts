import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(companyId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found with this email');
    }

    const existing = await this.prisma.membership.findFirst({
      where: { userId: user.id, companyId, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this company');
    }

    return this.prisma.membership.create({
      data: {
        userId: user.id,
        companyId,
        role: dto.role ?? MembershipRole.MEMBER,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.membership.findMany({
      where: { companyId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async updateRole(id: string, companyId: string, dto: UpdateRoleDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === MembershipRole.OWNER) {
      throw new BadRequestException('Cannot change the role of an OWNER');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async remove(id: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === MembershipRole.OWNER) {
      throw new BadRequestException('Cannot remove the OWNER from the company');
    }

    await this.prisma.membership.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
