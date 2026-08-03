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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.create')
  @ApiOperation({
    summary: 'Criar venda (nasce como ORCAMENTO)',
    description:
      'Com confirm: true a venda já é finalizada e dá baixa no estoque na mesma chamada.',
  })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(companyId, dto, user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.list')
  @ApiOperation({ summary: 'Listar vendas' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentCompany() companyId: string, @Query() filter: FilterSaleDto) {
    return this.salesService.findAll(companyId, filter);
  }

  // Declarado antes de :id — o Nest resolve as rotas na ordem e 'context'
  // cairia em findOne se viesse depois
  @Get('context')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.create')
  @ApiOperation({
    summary:
      'Dados para montar uma venda no PDV (estabelecimentos, clientes e produtos)',
  })
  @ApiResponse({ status: 200 })
  getContext(@CurrentCompany() companyId: string) {
    return this.salesService.getContext(companyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.read')
  @ApiOperation({ summary: 'Buscar venda por ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.findOne(id, companyId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.edit')
  @ApiOperation({ summary: 'Atualizar venda em ORCAMENTO ou EM_ABERTO' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.salesService.update(id, companyId, dto);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.confirm')
  @ApiOperation({
    summary: 'Finalizar venda e dar saída no estoque',
    description:
      'Venda A_VISTA exige payments somando o total. Em A_PRAZO o corpo é ignorado e os títulos são gerados.',
  })
  @ApiResponse({ status: 200 })
  confirm(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ConfirmSaleDto,
  ) {
    return this.salesService.confirm(id, companyId, user.id, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.cancel')
  @ApiOperation({
    summary: 'Cancelar venda',
    description: 'Estorna o estoque quando a venda já estava CONCLUIDA.',
  })
  @ApiResponse({ status: 200 })
  cancel(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.cancel(id, companyId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
  @RequirePermission('sales.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir venda em ORCAMENTO ou CANCELADA' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.salesService.remove(id, companyId);
  }
}
