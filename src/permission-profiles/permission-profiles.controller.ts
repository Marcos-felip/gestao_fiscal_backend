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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { PermissionProfilesService } from './permission-profiles.service';
import { CreatePermissionProfileDto } from './dto/create-permission-profile.dto';
import { UpdatePermissionProfileDto } from './dto/update-permission-profile.dto';

@ApiTags('permission-profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
@Controller('permission-profiles')
export class PermissionProfilesController {
  constructor(
    private readonly permissionProfilesService: PermissionProfilesService,
  ) {}

  @Get()
  @RequirePermission('permissions.manage')
  @ApiOperation({ summary: 'Listar perfis de permissão da empresa ativa' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string) {
    return this.permissionProfilesService.findAll(companyId);
  }

  @Post()
  @RequirePermission('permissions.manage')
  @ApiOperation({ summary: 'Criar perfil de permissão' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Nome já usado na empresa' })
  @ApiResponse({ status: 422, description: 'Código de permissão inexistente' })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePermissionProfileDto,
  ) {
    return this.permissionProfilesService.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermission('permissions.manage')
  @ApiOperation({ summary: 'Detalhar perfil de permissão' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.permissionProfilesService.findOne(id, companyId);
  }

  @Patch(':id')
  @RequirePermission('permissions.manage')
  @ApiOperation({
    summary:
      'Atualizar perfil de permissão (permissionCodes substitui a lista inteira)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  @ApiResponse({ status: 409, description: 'Nome já usado na empresa' })
  @ApiResponse({ status: 422, description: 'Código de permissão inexistente' })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdatePermissionProfileDto,
  ) {
    return this.permissionProfilesService.update(id, companyId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('permissions.manage')
  @ApiOperation({
    summary: 'Excluir perfil e desvinculá-lo de todos os membros',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.permissionProfilesService.remove(id, companyId);
  }
}
