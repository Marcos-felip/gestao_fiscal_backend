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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post('invite')
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Convidar usuário para a empresa (OWNER ou ADMIN)' })
  @ApiResponse({ status: 201 })
  invite(
    @CurrentCompany() companyId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipsService.invite(companyId, dto);
  }

  @Get()
  @TenantProtected()
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
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membershipsService.updateRole(id, companyId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Remover membro da empresa (apenas OWNER)' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.membershipsService.remove(id, companyId);
  }
}
