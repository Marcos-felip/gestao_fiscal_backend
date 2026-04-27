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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { FilterPurchaseDto } from './dto/filter-purchase.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.create')
  @ApiOperation({ summary: 'Criar nova compra' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.purchasesService.create(companyId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.list')
  @ApiOperation({ summary: 'Listar compras' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterPurchaseDto,
  ) {
    return this.purchasesService.findAll(companyId, filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.read')
  @ApiOperation({ summary: 'Buscar compra por ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.purchasesService.findOne(id, companyId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.edit')
  @ApiOperation({ summary: 'Atualizar compra em RASCUNHO' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.purchasesService.update(id, companyId, dto);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.confirm')
  @ApiOperation({ summary: 'Confirmar compra e dar entrada no estoque' })
  @ApiResponse({ status: 200 })
  confirm(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.purchasesService.confirm(id, companyId);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.cancel')
  @ApiOperation({ summary: 'Cancelar compra' })
  @ApiResponse({ status: 200 })
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.purchasesService.cancel(id, companyId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('purchases.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir compra em RASCUNHO ou CANCELADA' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.purchasesService.remove(id, companyId);
  }
}