import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { PermissionsService } from './permissions.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Listar permissões agrupadas por domínio' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':role')
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Listar permissões de um papel' })
  findByRole(@Param('role') role: MembershipRole) {
    return this.permissionsService.findByRole(role);
  }

  @Patch(':role')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Atualizar permissões de um papel (apenas MEMBER)' })
  updateRolePermissions(
    @Param('role') role: MembershipRole,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.permissionsService.updateRolePermissions(role, dto.permissionCodes);
  }
}