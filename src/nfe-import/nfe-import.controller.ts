import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NfeImportService } from './nfe-import.service';
import { SetItemProductDto } from './dto/set-item-product.dto';

/**
 * Uma NF-e de distribuidor tem centenas de itens, mas o XML é texto: 2 MB
 * cobrem com folga a maior nota real e barram upload de arquivo trocado.
 */
const MAX_XML_BYTES = 2 * 1024 * 1024;

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases/import')
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
export class NfeImportController {
  constructor(private readonly service: NfeImportService) {}

  @Post('nfe')
  @RequirePermission('purchases.import')
  @UseInterceptors(
    FileInterceptor('xml', { limits: { fileSize: MAX_XML_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importar o XML de uma NF-e de entrada',
    description:
      'Lê o XML, casa os itens com o catálogo e registra a importação. ' +
      'Não movimenta estoque: a compra nasce em rascunho na confirmação.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['xml'],
      properties: {
        xml: { type: 'string', format: 'binary', description: 'XML da NF-e' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Importação registrada' })
  @ApiResponse({ status: 409, description: 'Nota já importada' })
  importXml(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Envie o arquivo XML da nota no campo "xml"',
      );
    }

    return this.service.importXml(
      companyId,
      file.buffer.toString('utf-8'),
      user.id,
    );
  }

  @Get()
  @RequirePermission('purchases.import')
  @ApiOperation({ summary: 'Listar importações de nota de entrada' })
  findAll(
    @CurrentCompany() companyId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findAll(companyId, pagination);
  }

  @Get(':id')
  @RequirePermission('purchases.import')
  @ApiOperation({ summary: 'Detalhe da importação, com o casamento dos itens' })
  @ApiParam({ name: 'id', description: 'ID da importação' })
  findOne(
    @CurrentCompany() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(companyId, id);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('purchases.import')
  @ApiOperation({
    summary: 'Apontar o produto de um item',
    description:
      'A escolha é memorizada por fornecedor: na próxima nota do mesmo ' +
      'fornecedor o item já vem casado.',
  })
  setItemProduct(
    @CurrentCompany() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SetItemProductDto,
  ) {
    return this.service.setItemProduct(companyId, id, itemId, dto.productId);
  }

  @Post(':id/confirm')
  @RequirePermission('purchases.import')
  @ApiOperation({
    summary: 'Gerar a compra em rascunho',
    description:
      'Recusa enquanto houver item sem produto apontado. Não movimenta ' +
      'estoque nem gera títulos — isso é efeito da confirmação da compra.',
  })
  confirm(
    @CurrentCompany() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.confirm(companyId, id);
  }
}
