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
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @TenantProtected()
  @ApiOperation({ summary: 'Listar parceiros da empresa ativa' })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() filter: FilterPartnerDto,
  ) {
    return this.partnersService.findAll(companyId, filter);
  }

  @Post()
  @TenantProtected()
  @ApiOperation({ summary: 'Criar novo parceiro' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePartnerDto,
  ) {
    return this.partnersService.create(companyId, dto);
  }

  @Get(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Buscar parceiro por ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.partnersService.findOne(id, companyId);
  }

  @Patch(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Atualizar parceiro' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(id, companyId, dto);
  }

  @Delete(':id')
  @TenantProtected()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir parceiro (soft delete)' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.partnersService.remove(id, companyId);
  }
}
