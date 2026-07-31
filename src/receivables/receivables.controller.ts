import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReceivablesService } from './receivables.service';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { FilterReceivableDto } from './dto/filter-receivable.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('receivables')
@ApiBearerAuth()
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('receivables.list')
  @ApiOperation({ summary: 'Listar contas a receber' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterReceivableDto,
  ) {
    return this.receivablesService.findAll(companyId, filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('receivables.read')
  @ApiOperation({ summary: 'Detalhar título com os recebimentos' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.receivablesService.findOne(id, companyId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('receivables.create')
  @ApiOperation({
    summary: 'Criar título manual',
    description: 'Com installments > 1 gera uma linha por parcela.',
  })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateReceivableDto,
  ) {
    return this.receivablesService.create(companyId, dto);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('receivables.pay')
  @ApiOperation({ summary: 'Registrar baixa total ou parcial' })
  @ApiResponse({ status: 201 })
  pay(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: PayReceivableDto,
  ) {
    return this.receivablesService.pay(id, companyId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('receivables.cancel')
  @ApiOperation({ summary: 'Cancelar título' })
  @ApiResponse({ status: 201 })
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.receivablesService.cancel(id, companyId);
  }
}
