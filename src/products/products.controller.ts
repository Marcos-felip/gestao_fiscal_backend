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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @TenantProtected()
  @ApiOperation({ summary: 'List all products for the current company' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.productsService.findAll(companyId, pagination);
  }

  @Post()
  @TenantProtected()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(companyId, dto);
  }

  @Get(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.productsService.findOne(id, companyId);
  }

  @Patch(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, companyId, dto);
  }

  @Delete(':id')
  @TenantProtected()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.productsService.remove(id, companyId);
  }
}
