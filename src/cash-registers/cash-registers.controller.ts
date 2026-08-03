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
import { CashRegistersService } from './cash-registers.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { FilterCashRegisterDto } from './dto/filter-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('cash-registers')
@ApiBearerAuth()
@Controller('cash-registers')
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
export class CashRegistersController {
  constructor(private readonly cashRegistersService: CashRegistersService) {}

  @Get()
  @RequirePermission('cash-registers.list')
  @ApiOperation({ summary: 'Listar caixas da empresa ativa' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterCashRegisterDto,
  ) {
    return this.cashRegistersService.findAll(companyId, filter);
  }

  @Post()
  @RequirePermission('cash-registers.create')
  @ApiOperation({ summary: 'Cadastrar caixa (terminal)' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateCashRegisterDto,
  ) {
    return this.cashRegistersService.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermission('cash-registers.read')
  @ApiOperation({ summary: 'Buscar caixa por ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.cashRegistersService.findOne(id, companyId);
  }

  @Patch(':id')
  @RequirePermission('cash-registers.edit')
  @ApiOperation({ summary: 'Atualizar caixa' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCashRegisterDto,
  ) {
    return this.cashRegistersService.update(id, companyId, dto);
  }

  @Delete(':id')
  @RequirePermission('cash-registers.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir caixa (soft delete)' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.cashRegistersService.remove(id, companyId);
  }
}
