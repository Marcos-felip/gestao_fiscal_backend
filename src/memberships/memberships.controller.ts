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
  @ApiOperation({ summary: 'Invite a user to the company (OWNER or ADMIN)' })
  @ApiResponse({ status: 201 })
  invite(
    @CurrentCompany() companyId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipsService.invite(companyId, dto);
  }

  @Get()
  @TenantProtected()
  @ApiOperation({ summary: 'List all memberships for current company' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string) {
    return this.membershipsService.findAll(companyId);
  }

  @Patch(':id/role')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Update a membership role (OWNER only)' })
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
  @ApiOperation({ summary: 'Remove a member from the company (OWNER only)' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.membershipsService.remove(id, companyId);
  }
}
