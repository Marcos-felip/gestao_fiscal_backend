import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Param,
  ParseEnumPipe,
  Body,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentMembership } from '../common/decorators/current-membership.decorator';
import type { CurrentMembershipData } from '../common/decorators/current-membership.decorator';
import { PermissionsService } from './permissions.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

const roleParam = () =>
  new ParseEnumPipe(MembershipRole, {
    exceptionFactory: () =>
      new BadRequestException(
        'Papel inválido. Valores aceitos: OWNER, ADMIN, MEMBER',
      ),
  });

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('me')
  @TenantProtected()
  @ApiOperation({
    summary: 'Listar as permissões do usuário autenticado na empresa ativa',
  })
  findMine(@CurrentMembership() membership: CurrentMembershipData) {
    return this.permissionsService.findEffectivePermissions(membership);
  }

  @Get()
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Listar permissões agrupadas por domínio' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':role')
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Listar permissões de um papel na empresa ativa' })
  findByRole(
    @CurrentCompany() companyId: string,
    @Param('role', roleParam()) role: MembershipRole,
  ) {
    return this.permissionsService.findByRole(companyId, role);
  }

  @Patch(':role')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({
    summary:
      'Atualizar permissões de um papel na empresa ativa (apenas MEMBER)',
  })
  updateRolePermissions(
    @CurrentCompany() companyId: string,
    @Param('role', roleParam()) role: MembershipRole,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.permissionsService.updateRolePermissions(
      companyId,
      role,
      dto.permissionCodes,
    );
  }
}
