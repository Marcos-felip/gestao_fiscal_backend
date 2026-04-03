import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { EstablishmentsService } from './establishments.service';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('establishments')
@ApiBearerAuth()
@Controller('establishments')
export class EstablishmentsController {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  @Get()
  @TenantProtected()
  @ApiOperation({ summary: 'List all establishments for the current company' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string) {
    return this.establishmentsService.findAll(companyId);
  }

  @Post()
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Create a new establishment' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateEstablishmentDto,
  ) {
    return this.establishmentsService.create(companyId, dto);
  }

  @Get(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Get an establishment by ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.establishmentsService.findOne(id, companyId);
  }

  @Patch(':id')
  @TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Update an establishment' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateEstablishmentDto,
  ) {
    return this.establishmentsService.update(id, companyId, dto);
  }

  @Delete(':id')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Soft-delete an establishment (cannot delete MATRIZ)' })
  @ApiResponse({ status: 200 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.establishmentsService.remove(id, companyId);
  }
}
