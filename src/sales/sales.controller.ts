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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @TenantProtected()
  @ApiOperation({ summary: 'Create a new sale' })
  @ApiResponse({ status: 201 })
  create(@CurrentCompany() companyId: string, @Body() dto: CreateSaleDto) {
    return this.salesService.create(companyId, dto);
  }

  @Get()
  @TenantProtected()
  @ApiOperation({ summary: 'List sales' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string, @Query() filter: FilterSaleDto) {
    return this.salesService.findAll(companyId, filter);
  }

  @Get(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Get a sale by ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.findOne(id, companyId);
  }

  @Patch(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Update a DRAFT sale' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.salesService.update(id, companyId, dto);
  }

  @Post(':id/confirm')
  @TenantProtected()
  @ApiOperation({ summary: 'Confirm a sale and deduct stock' })
  @ApiResponse({ status: 200 })
  confirm(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.confirm(id, companyId);
  }

  @Post(':id/cancel')
  @TenantProtected(MembershipRole.ADMIN, MembershipRole.OWNER)
  @ApiOperation({ summary: 'Cancel a sale' })
  @ApiResponse({ status: 200 })
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.cancel(id, companyId);
  }

  @Delete(':id')
  @TenantProtected(MembershipRole.ADMIN, MembershipRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a DRAFT or CANCELLED sale' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.remove(id, companyId);
  }
}
