import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('movements')
  @TenantProtected()
  @ApiOperation({ summary: 'Registrar movimentação de estoque' })
  @ApiResponse({ status: 201 })
  createMovement(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.stockService.createMovement(companyId, dto);
  }

  @Get('movements')
  @TenantProtected()
  @ApiOperation({ summary: 'Listar movimentações de estoque' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterStockMovementDto,
  ) {
    return this.stockService.findAll(companyId, filter);
  }
}
