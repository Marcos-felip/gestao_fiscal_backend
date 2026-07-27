import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserByAdminDto } from './dto/update-user-by-admin.dto';
import { UpdateActiveCompanyDto } from './dto/update-active-company.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { AddUserToCompanyMembershipDto } from './dto/add-membership.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentMembership } from '../common/decorators/current-membership.decorator';
import type { CurrentMembershipData } from '../common/decorators/current-membership.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({ status: 200 })
  getProfile(@CurrentUser() user: { id: string; email: string }) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Atualizar perfil do usuário' })
  @ApiResponse({ status: 200 })
  updateProfile(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('active-company')
  @ApiOperation({ summary: 'Definir empresa ativa do usuário' })
  @ApiResponse({ status: 200 })
  updateActiveCompany(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: UpdateActiveCompanyDto,
  ) {
    return this.usersService.updateActiveCompany(user.id, dto);
  }

  @Post()
  @UseGuards(CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.create')
  @ApiOperation({ summary: 'Criar novo usuário na empresa' })
  @ApiResponse({ status: 201 })
  createUser(
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createUser(dto, companyId, membership.role);
  }

  @Post(':id/memberships')
  @UseGuards(CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.create')
  @ApiOperation({ summary: 'Adicionar usuário existente à empresa' })
  @ApiResponse({ status: 201 })
  addMembership(
    @Param('id') userId: string,
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: AddUserToCompanyMembershipDto,
  ) {
    return this.usersService.addMembership(
      userId,
      companyId,
      dto,
      membership.role,
    );
  }

  // Declarada por último: as rotas estáticas (profile, active-company)
  // precisam ser resolvidas antes deste parâmetro dinâmico.
  @Patch(':id')
  @UseGuards(CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('users.edit')
  @ApiOperation({ summary: 'Editar usuário da empresa ativa' })
  @ApiResponse({ status: 200 })
  updateUserByAdmin(
    @Param('id') userId: string,
    @CurrentCompany() companyId: string,
    @CurrentMembership() membership: CurrentMembershipData,
    @Body() dto: UpdateUserByAdminDto,
  ) {
    return this.usersService.updateUserByAdmin(
      userId,
      companyId,
      dto,
      membership.role,
    );
  }
}
