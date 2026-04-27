import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RequirePermissionGuard } from './guards/require-permission.guard';
import { CompanyTenantGuard } from './guards/company-tenant.guard';

@Module({
  imports: [PrismaModule],
  providers: [RequirePermissionGuard, CompanyTenantGuard],
  exports: [RequirePermissionGuard, CompanyTenantGuard],
})
export class CommonModule {}
