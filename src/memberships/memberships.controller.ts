import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentMembership } from '../common/decorators/current-membership.decorator';
import type { CurrentMembershipData } from '../common/decorators/current-membership.decorator';
import { PermissionProfilesService } from '../permission-profiles/permission-profiles.service';
import { SetMembershipProfilesDto } from '../permission-profiles/dto/set-membership-profiles.dto';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly permissionProfilesService: PermissionProfilesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.create')
  @ApiOperation({ summary: 'Criar membro na empresa' })
  @ApiResponse({ status: 201 })
  createMember(
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membershipsService.createMember(
      companyId,
      dto,
      membership.role,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.list')
  @ApiOperation({ summary: 'Listar membros da empresa ativa' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string) {
    return this.membershipsService.findAll(companyId);
  }

  @Patch(':id/role')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Alterar papel de um membro (apenas OWNER)' })
  @ApiResponse({ status: 200 })
  updateRole(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membershipsService.updateRole(
      id,
      companyId,
      dto,
      membership.role,
    );
  }

  @Get(':id/profiles')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('permissions.manage')
  @ApiOperation({ summary: 'Listar perfis de permissão vinculados ao membro' })
  @ApiResponse({ status: 200 })
  findProfiles(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.permissionProfilesService.findMembershipProfiles(id, companyId);
  }

  @Put(':id/profiles')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('permissions.manage')
  @ApiOperation({
    summary: 'Substituir os perfis de permissão do membro (apenas MEMBER)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: 'Membro não tem papel MEMBER' })
  @ApiResponse({ status: 422, description: 'Perfil de outra empresa' })
  setProfiles(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: SetMembershipProfilesDto,
  ) {
    return this.permissionProfilesService.setMembershipProfiles(
      id,
      companyId,
      dto.profileIds,
      membership.role,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.delete')
  @ApiOperation({ summary: 'Remover membro da empresa ativa' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
  ) {
    return this.membershipsService.remove(id, companyId, membership.role);
  }
}
