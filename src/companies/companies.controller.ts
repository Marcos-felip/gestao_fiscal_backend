import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantProtected } from '../common/decorators/tenant-protected.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar nova empresa' })
  @ApiResponse({ status: 201 })
  create(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar empresas do usuário autenticado' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: { id: string; email: string }) {
    return this.companiesService.findAllForUser(user.id);
  }

  @Get(':id')
  @TenantProtected()
  @ApiOperation({ summary: 'Buscar empresa por ID' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.companiesService.findOne(id, companyId);
  }

  @Post('onboarding')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Configurar empresa com CNPJ, regime tributário e estabelecimento MATRIZ' })
  @ApiResponse({ status: 200 })
  onboard(
    @CurrentCompany() companyId: string,
    @Body() dto: OnboardingDto,
  ) {
    return this.companiesService.onboard(companyId, dto);
  }

  @Patch(':id')
  @TenantProtected(MembershipRole.OWNER)
  @ApiOperation({ summary: 'Atualizar empresa (apenas OWNER)' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    void id;
    return this.companiesService.update(companyId, dto);
  }
}
