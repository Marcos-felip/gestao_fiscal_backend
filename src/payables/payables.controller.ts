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
import { PayablesService } from './payables.service';
import { CreatePayableDto } from './dto/create-payable.dto';
import { FilterPayableDto } from './dto/filter-payable.dto';
import { PayPayableDto } from './dto/pay-payable.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('payables')
@ApiBearerAuth()
@Controller('payables')
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('payables.list')
  @ApiOperation({ summary: 'Listar contas a pagar' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterPayableDto,
  ) {
    return this.payablesService.findAll(companyId, filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('payables.read')
  @ApiOperation({ summary: 'Detalhar título com os pagamentos' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.payablesService.findOne(id, companyId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('payables.create')
  @ApiOperation({
    summary: 'Criar título manual',
    description: 'Com installments > 1 gera uma linha por parcela.',
  })
  @ApiResponse({ status: 201 })
  create(@CurrentCompany() companyId: string, @Body() dto: CreatePayableDto) {
    return this.payablesService.create(companyId, dto);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('payables.pay')
  @ApiOperation({ summary: 'Registrar baixa total ou parcial' })
  @ApiResponse({ status: 201 })
  pay(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: PayPayableDto,
  ) {
    return this.payablesService.pay(id, companyId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('payables.cancel')
  @ApiOperation({ summary: 'Cancelar título' })
  @ApiResponse({ status: 201 })
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.payablesService.cancel(id, companyId);
  }
}
