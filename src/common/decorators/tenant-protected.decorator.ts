import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../guards/company-tenant.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

export function TenantProtected(...roles: MembershipRole[]) {
  return applyDecorators(
    ...(roles.length > 0 ? [Roles(...roles)] : []),
    UseGuards(JwtAuthGuard, CompanyTenantGuard, RolesGuard),
    ApiBearerAuth(),
  );
}
