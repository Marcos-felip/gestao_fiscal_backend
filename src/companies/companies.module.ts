import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyTenantGuard, RolesGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
