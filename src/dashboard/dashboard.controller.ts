import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { FilterDashboardDto } from './dto/filter-dashboard.dto';
import { SalesChartDto } from './dto/sales-chart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

/**
 * Indicadores da tela de início.
 *
 * Uma rota por bloco, e **cada uma exige a permissão do domínio que resume**.
 * Não há `dashboard.read`: um código único concederia em bloco o que o resto do
 * sistema concede por domínio, e a home viraria porta lateral para o
 * faturamento que `sales.list` nega ao estoquista.
 *
 * Nenhuma rota escreve.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('sales')
  @RequirePermission('sales.list')
  @ApiOperation({
    summary: 'Faturamento de hoje, de ontem e do mês',
    description:
      'Quantidade, valor e ticket médio de cada recorte, contando apenas vendas concluídas. ' +
      'Orçamentos e vendas em digitação aparecem à parte, como funil. ' +
      'Os recortes de tempo usam o fuso da operação, não o do servidor.',
  })
  @ApiResponse({ status: 200 })
  sales(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterDashboardDto,
  ) {
    return this.dashboardService.sales(companyId, filter);
  }

  @Get('sales-chart')
  @RequirePermission('sales.list')
  @ApiOperation({
    summary: 'Série de faturamento para o gráfico',
    description:
      'Últimos 30 dias (um ponto por dia) ou últimos 12 meses (um ponto por mês). ' +
      'Períodos sem venda vêm com total zero, para o gráfico não ligar duas datas distantes por uma reta.',
  })
  @ApiResponse({ status: 200 })
  salesChart(
    @CurrentCompany() companyId: string,
    @Query() filter: SalesChartDto,
  ) {
    return this.dashboardService.salesChart(companyId, filter);
  }

  @Get('receivables')
  @RequirePermission('receivables.list')
  @ApiOperation({
    summary: 'Contas a receber: vencidas, do dia e da semana',
    description:
      'Os valores são o saldo em aberto (valor menos o já baixado), nunca o valor de face. ' +
      'Vencido é derivado contra o agora, pelo mesmo critério do módulo financeiro.',
  })
  @ApiResponse({ status: 200 })
  receivables(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterDashboardDto,
  ) {
    return this.dashboardService.receivables(companyId, filter);
  }

  @Get('payables')
  @RequirePermission('payables.list')
  @ApiOperation({
    summary: 'Contas a pagar: vencidas, do dia e da semana',
    description:
      'Mesmo recorte do contas a receber, com permissão própria — quem só enxerga o que entra não recebe o que sai de brinde.',
  })
  @ApiResponse({ status: 200 })
  payables(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterDashboardDto,
  ) {
    return this.dashboardService.payables(companyId, filter);
  }

  @Get('fiscal')
  @RequirePermission('fiscal.read')
  @ApiOperation({
    summary: 'Documentos fiscais do mês e alerta de certificado',
    description:
      'Contagem por situação, valor autorizado no mês e aviso dos certificados A1 que vencem em até 30 dias. ' +
      'Empresa que ainda não emite responde zerada, sem erro.',
  })
  @ApiResponse({ status: 200 })
  fiscal(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterDashboardDto,
  ) {
    return this.dashboardService.fiscal(companyId, filter);
  }

  @Get('stock-alerts')
  @RequirePermission('products.list')
  @ApiOperation({
    summary: 'Produtos zerados e no limite do mínimo',
    description:
      'Produto sem estoque mínimo cadastrado fica fora do alerta de mínimo — não há parâmetro contra o qual comparar. ' +
      'O saldo é da empresa: `establishmentId` não se aplica a esta rota.',
  })
  @ApiResponse({ status: 200 })
  stockAlerts(@CurrentCompany() companyId: string) {
    return this.dashboardService.stockAlerts(companyId);
  }

  @Get('cash')
  @RequirePermission('cash.list')
  @ApiOperation({
    summary: 'Caixas abertos agora e sessões fechadas hoje',
    description:
      'Com o fechamento às cegas ligado, o total vendido da sessão aberta vem nulo: é o número que a conferência às cegas existe para esconder.',
  })
  @ApiResponse({ status: 200 })
  cash(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterDashboardDto,
  ) {
    return this.dashboardService.cash(companyId, filter);
  }
}
