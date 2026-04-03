import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService, CompanyTenantGuard, RolesGuard],
  exports: [MembershipsService],
})
export class MembershipsModule {}
