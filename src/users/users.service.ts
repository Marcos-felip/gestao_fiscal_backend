import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateActiveCompanyDto } from './dto/update-active-company.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { memberships, ...rest } = user;
    return { ...rest, membershipsCount: memberships.length };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    await this.getProfile(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        updatedAt: true,
      },
    });
  }

  async updateActiveCompany(userId: string, dto: UpdateActiveCompanyDto) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId: dto.companyId,
        deletedAt: null,
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of the target company');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { companyActiveId: dto.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        companyActiveId: true,
        updatedAt: true,
      },
    });
  }
}
