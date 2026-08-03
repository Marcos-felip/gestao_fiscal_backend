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
import { CashSessionsService } from './cash-sessions.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { FilterCashSessionDto } from './dto/filter-cash-session.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('cash-sessions')
@ApiBearerAuth()
@Controller('cash-sessions')
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Post('open')
  @RequirePermission('cash.open')
  @ApiOperation({ summary: 'Abrir uma sessão de caixa com o fundo de troco' })
  @ApiResponse({ status: 201 })
  open(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.cashSessionsService.open(companyId, user.id, dto);
  }

  // Antes de :id — o Nest resolve as rotas na ordem e 'current' cairia em findOne
  @Get('current')
  @RequirePermission('cash.read')
  @ApiOperation({
    summary: 'Sessão aberta do operador logado',
    description: 'Devolve null quando o operador não tem caixa aberto.',
  })
  @ApiResponse({ status: 200 })
  current(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.cashSessionsService.current(companyId, user.id);
  }

  @Get()
  @RequirePermission('cash.list')
  @ApiOperation({ summary: 'Histórico de sessões' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterCashSessionDto,
  ) {
    return this.cashSessionsService.findAll(companyId, filter);
  }

  @Get(':id')
  @RequirePermission('cash.read')
  @ApiOperation({ summary: 'Detalhar sessão com movimentações e resumo' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.cashSessionsService.findOne(id, companyId);
  }

  @Post(':id/movements')
  @RequirePermission('cash.movement')
  @ApiOperation({ summary: 'Registrar sangria ou suprimento' })
  @ApiResponse({ status: 201 })
  addMovement(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.cashSessionsService.addMovement(id, companyId, user.id, dto);
  }

  @Post(':id/close')
  @RequirePermission('cash.close')
  @ApiOperation({
    summary: 'Fechar a sessão conferindo o dinheiro em gaveta',
    description:
      'Havendo diferença, notes é obrigatório. A sessão fecha mesmo com quebra.',
  })
  @ApiResponse({ status: 201 })
  close(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.cashSessionsService.close(id, companyId, dto);
  }
}
