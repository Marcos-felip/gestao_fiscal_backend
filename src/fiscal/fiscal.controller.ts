import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FiscalEnvironment } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyTenantGuard } from '../common/guards/company-tenant.guard';
import { RequirePermissionGuard } from '../common/guards/require-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FiscalService } from './fiscal.service';
import { CreateFiscalSettingsDto } from './dto/create-fiscal-settings.dto';
import { UpdateFiscalSettingsDto } from './dto/update-fiscal-settings.dto';
import { QueryFiscalDocumentsDto } from './dto/query-fiscal-documents.dto';
import { EmitNfceDto } from './dto/emit-nfce.dto';
import { EmitNfeDto } from './dto/emit-nfe.dto';
import { ExportXmlsDto } from './dto/export-xmls.dto';
import { UploadCertificateDto } from './dto/upload-certificate.dto';
import { CancelFiscalDocumentDto } from './dto/cancel-fiscal-document.dto';
import { CreateCorrectionLetterDto } from './dto/create-correction-letter.dto';
import { InutilizeNumberingDto } from './dto/inutilize-numbering.dto';
import { FiscalEventsService } from './events/fiscal-events.service';
import { FiscalOperationsService } from './fiscal-operations.service';
import {
  FiscalCertificateService,
  MAX_CERTIFICATE_BYTES,
} from './certificates/fiscal-certificate.service';
import { FISCAL_EMISSION_QUEUE } from '../queue/queue.constants';

@ApiTags('fiscal')
@ApiBearerAuth()
@Controller('fiscal')
@UseGuards(JwtAuthGuard, CompanyTenantGuard)
export class FiscalController {
  private readonly logger = new Logger(FiscalController.name);

  constructor(
    private readonly fiscalService: FiscalService,
    private readonly certificateService: FiscalCertificateService,
    private readonly operationsService: FiscalOperationsService,
    private readonly eventsService: FiscalEventsService,
    @InjectQueue(FISCAL_EMISSION_QUEUE)
    private readonly fiscalQueue: Queue,
  ) {}

  // ──────────────────────────────────────────────
  // Fiscal Settings
  // ──────────────────────────────────────────────

  @Post('settings/:establishmentId/certificate')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @UseInterceptors(
    FileInterceptor('certificado', {
      limits: { fileSize: MAX_CERTIFICATE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Enviar ou substituir o certificado digital A1 (.pfx)',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['certificado', 'senha'],
      properties: {
        certificado: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo .pfx/.p12 do certificado A1',
        },
        senha: { type: 'string', description: 'Senha do certificado' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Certificado armazenado' })
  @ApiResponse({
    status: 400,
    description: 'Arquivo inválido, senha incorreta ou certificado vencido',
  })
  uploadCertificate(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
    @UploadedFile() certificado: Express.Multer.File | undefined,
    @Body() dto: UploadCertificateDto,
    @Query('ambiente', new ParseEnumPipe(FiscalEnvironment, { optional: true }))
    ambiente?: FiscalEnvironment,
  ) {
    return this.certificateService.upload(
      companyId,
      establishmentId,
      certificado?.buffer ?? Buffer.alloc(0),
      dto.senha,
      user.id,
      ambiente,
    );
  }

  @Get('settings/:establishmentId/certificate')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Situação do certificado digital do estabelecimento',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  getCertificateStatus(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
    @Query('ambiente', new ParseEnumPipe(FiscalEnvironment, { optional: true }))
    ambiente?: FiscalEnvironment,
  ) {
    return this.certificateService.getStatus(
      companyId,
      establishmentId,
      ambiente,
    );
  }

  @Get('settings/:establishmentId/certificate/history')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Histórico de envio e substituição do certificado digital',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  getCertificateHistory(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
    @Query('ambiente', new ParseEnumPipe(FiscalEnvironment, { optional: true }))
    ambiente?: FiscalEnvironment,
  ) {
    return this.certificateService.getHistory(
      companyId,
      establishmentId,
      ambiente,
    );
  }

  @Post('settings')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({
    summary: 'Criar configuração fiscal para um estabelecimento',
  })
  @ApiResponse({ status: 201, description: 'Configuração fiscal criada' })
  @ApiResponse({
    status: 400,
    description: 'Estabelecimento já possui configuração',
  })
  createSettings(
    @CurrentCompany() companyId: string,
    @Body() dto: CreateFiscalSettingsDto,
  ) {
    return this.fiscalService.createSettings(companyId, dto);
  }

  @Get('settings')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({ summary: 'Listar todas as configurações fiscais da empresa' })
  @ApiResponse({ status: 200 })
  findAllSettings(@CurrentCompany() companyId: string) {
    return this.fiscalService.findAllSettings(companyId);
  }

  @Get('settings/:establishmentId')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({ summary: 'Buscar configuração fiscal de um estabelecimento' })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Configuração não encontrada' })
  findSettings(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.findSettings(companyId, establishmentId);
  }

  @Patch('settings/:establishmentId')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({
    summary: 'Atualizar a configuração fiscal em uso pelo estabelecimento',
    description:
      'Atualiza a configuração do ambiente ativo. Trocar de ambiente é feito pela rota de ativação.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200, description: 'Configuração fiscal atualizada' })
  updateSettings(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
    @Body() dto: UpdateFiscalSettingsDto,
  ) {
    return this.fiscalService.updateSettings(
      companyId,
      establishmentId,
      dto,
      user.id,
    );
  }

  @Get('settings/:establishmentId/ambientes')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Listar as configurações do estabelecimento por ambiente',
    description:
      'Homologação e produção têm série, numeração, CSC e certificado próprios.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  findSettingsByEnvironment(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.findSettingsByEnvironment(
      companyId,
      establishmentId,
    );
  }

  @Post('settings/:establishmentId/ambientes/:ambiente/ativar')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({ summary: 'Trocar o ambiente fiscal em uso' })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiParam({
    name: 'ambiente',
    description: 'Ambiente a ativar',
    enum: FiscalEnvironment,
  })
  @ApiResponse({ status: 201, description: 'Ambiente ativado' })
  @ApiResponse({
    status: 400,
    description: 'Produção ainda não liberada pelo checklist',
  })
  activateEnvironment(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
    @Param('ambiente', new ParseEnumPipe(FiscalEnvironment))
    ambiente: FiscalEnvironment,
  ) {
    return this.fiscalService.activateEnvironment(
      companyId,
      establishmentId,
      ambiente,
      user.id,
    );
  }

  @Get('settings/:establishmentId/producao/checklist')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Checklist de ativação da produção',
    description:
      'Confere certificado, CSC, série e numeração da configuração de produção.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  getProductionChecklist(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.getProductionChecklist(
      companyId,
      establishmentId,
    );
  }

  @Post('settings/:establishmentId/producao/liberar')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({
    summary: 'Liberar a emissão em produção',
    description: 'Só passa com todos os itens do checklist concluídos.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 201, description: 'Produção liberada' })
  @ApiResponse({ status: 400, description: 'Checklist incompleto' })
  releaseProduction(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.releaseProduction(
      companyId,
      establishmentId,
      user.id,
    );
  }

  @Post('settings/:establishmentId/producao/revogar')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({
    summary: 'Revogar a produção e voltar para homologação',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 201, description: 'Produção revogada' })
  revokeProduction(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.revokeProduction(
      companyId,
      establishmentId,
      user.id,
    );
  }

  @Post('settings/:establishmentId/producao/validar-consulta')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.edit')
  @ApiOperation({
    summary: 'Validar consulta pública da nota autorizada em produção',
    description:
      'Consulta a SEFAZ para confirmar que a nota autorizada em produção é visível na consulta pública.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 201, description: 'Consulta pública validada' })
  @ApiResponse({
    status: 400,
    description:
      'Produção não liberada, nenhuma nota autorizada ou falha na SEFAZ',
  })
  validarConsultaPublica(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.validarConsultaPublica(
      companyId,
      establishmentId,
      user.id,
    );
  }

  @Get('settings/:establishmentId/history')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Histórico de alterações da configuração fiscal',
    description:
      'Trocas de série, de CSC, de ambiente e liberação de produção.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  getSettingsHistory(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.fiscalService.getSettingsHistory(companyId, establishmentId);
  }

  // ──────────────────────────────────────────────
  // Fiscal Documents
  // ──────────────────────────────────────────────

  @Get('documents')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Listar documentos fiscais da empresa' })
  @ApiResponse({ status: 200 })
  findAllDocuments(
    @CurrentCompany() companyId: string,
    @Query() query: QueryFiscalDocumentsDto,
  ) {
    return this.fiscalService.findAllDocuments(companyId, query);
  }

  @Get('documents/xml/export')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({
    summary: 'Exportar em lote os XMLs de um período',
    description:
      'Devolve um ZIP com os XMLs dos documentos AUTORIZADO e CANCELADO do ' +
      'período, mais o manifesto `_relacao.csv` para conferência. Documento ' +
      'cancelado leva o XML autorizado e o do evento de cancelamento. ' +
      'Limites: 92 dias e 5.000 documentos por exportação.',
  })
  @ApiResponse({ status: 200, description: 'Arquivo ZIP com os XMLs' })
  @ApiResponse({
    status: 400,
    description:
      'Período inválido, longo demais ou acima do limite de documentos',
  })
  async exportarXmls(
    @CurrentCompany() companyId: string,
    @Query() query: ExportXmlsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { nomeArquivo, arquivo } = await this.fiscalService.exportarXmls(
      companyId,
      query,
    );

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeArquivo}"`,
    );

    return new StreamableFile(arquivo);
  }

  @Get('documents/:id')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Detalhar documento fiscal' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Documento fiscal não encontrado' })
  findDocumentById(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.fiscalService.findDocumentById(id, companyId);
  }

  @Get('documents/sale/:saleId')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Buscar documento fiscal por venda' })
  @ApiParam({ name: 'saleId', description: 'ID da venda' })
  @ApiResponse({ status: 200 })
  findDocumentBySale(
    @Param('saleId') saleId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.fiscalService.findDocumentBySale(saleId, companyId);
  }

  @Post('documents/nfce')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.emit')
  @ApiOperation({
    summary: 'Emitir NFC-e manualmente para uma venda concluída',
  })
  @ApiResponse({ status: 201, description: 'Emissão enfileirada' })
  @ApiResponse({
    status: 400,
    description: 'Venda já possui documento fiscal ativo',
  })
  async emitNfce(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: EmitNfceDto,
  ) {
    const fiscalDocument = await this.fiscalService.createManualEmission(
      companyId,
      dto,
      user.id,
    );

    // Enfileira a emissão
    await this.fiscalQueue.add(
      'emitir',
      {
        fiscalDocumentId: fiscalDocument.id,
        companyId,
        usuarioId: user.id,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `fiscal-${fiscalDocument.id}`,
      },
    );

    this.logger.log(
      `Emissão manual enfileirada: documento=${fiscalDocument.id}`,
    );

    return fiscalDocument;
  }

  @Post('documents/nfe')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.nfe.emit')
  @ApiOperation({
    summary: 'Emitir NF-e modelo 55 para uma venda concluída',
    description:
      'Exige destinatário pessoa jurídica com endereço completo, código IBGE e ' +
      'indicador de inscrição estadual. Operação interestadual está fora do ' +
      'escopo atual e é recusada nomeando as UFs. Permissão separada da NFC-e: ' +
      'quem opera o caixa não necessariamente emite NF-e.',
  })
  @ApiResponse({ status: 201, description: 'Emissão enfileirada' })
  @ApiResponse({
    status: 400,
    description:
      'Venda já possui documento fiscal ativo, ou destinatário incompleto — ' +
      'a resposta nomeia cada campo que falta',
  })
  async emitNfe(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: EmitNfeDto,
  ) {
    const fiscalDocument = await this.fiscalService.createNfeEmission(
      companyId,
      dto,
      user.id,
    );

    await this.fiscalQueue.add(
      'emitir',
      {
        fiscalDocumentId: fiscalDocument.id,
        companyId,
        usuarioId: user.id,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `fiscal-${fiscalDocument.id}`,
      },
    );

    this.logger.log(
      `Emissão de NF-e enfileirada: documento=${fiscalDocument.id}`,
    );

    return fiscalDocument;
  }

  // ──────────────────────────────────────────────
  // Eventos: carta de correção e inutilização
  // ──────────────────────────────────────────────

  @Post('documents/:id/carta-correcao')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.cce')
  @ApiOperation({
    summary: 'Emitir carta de correção para um documento autorizado',
    description:
      'A sequência é atribuída pelo sistema, a partir das correções anteriores. ' +
      'O limite legal é de 20 por nota. A resposta traz a condição de uso, que ' +
      'deve ser exibida antes da confirmação — a CC-e não corrige valores, ' +
      'datas nem as partes.',
  })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 201, description: 'Carta de correção registrada' })
  @ApiResponse({
    status: 400,
    description:
      'Documento não autorizado, limite de 20 atingido, ou recusa da SEFAZ',
  })
  createCorrectionLetter(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: CreateCorrectionLetterDto,
  ) {
    return this.eventsService.createCorrectionLetter(
      companyId,
      id,
      dto,
      user.id,
    );
  }

  @Get('documents/:id/cartas-correcao')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Cartas de correção de um documento' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 200 })
  listCorrectionLetters(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.eventsService.listCorrectionLetters(companyId, id);
  }

  @Post('inutilizacoes')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.inutilizar')
  @ApiOperation({
    summary: 'Inutilizar faixa de numeração',
    description:
      'Regulariza numeração reservada que nunca virou nota. A faixa que ' +
      'incluir número de documento autorizado ou cancelado é recusada, ' +
      'nomeando o número e a chave — inutilizar numeração válida não se desfaz.',
  })
  @ApiResponse({ status: 201, description: 'Faixa inutilizada' })
  @ApiResponse({
    status: 400,
    description:
      'Faixa inválida, conflito com documento emitido ou recusa da SEFAZ',
  })
  inutilize(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: InutilizeNumberingDto,
  ) {
    return this.eventsService.inutilize(companyId, dto, user.id);
  }

  @Get('inutilizacoes/pendentes/:establishmentId')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.inutilizar')
  @ApiOperation({
    summary: 'Faixas de numeração reservadas que nunca viraram documento',
    description:
      'Calculadas do que já existe: de 1 até o próximo número, tudo que não ' +
      'tem documento foi reservado e perdido. Sugerir evita digitar a faixa ' +
      'errada.',
  })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 200 })
  pendingRanges(
    @Param('establishmentId') establishmentId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.eventsService.pendingRanges(companyId, establishmentId);
  }

  @Get('documents/:id/history')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Histórico de status de um documento fiscal' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 200 })
  getStatusHistory(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.fiscalService.getStatusHistory(id, companyId);
  }

  @Get('documents/:id/events')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Eventos de um documento fiscal' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 200 })
  getEvents(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.fiscalService.getEvents(id, companyId);
  }

  @Post('documents/:id/cancel')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.cancel')
  @ApiOperation({ summary: 'Cancelar um documento fiscal autorizado' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 201, description: 'Cancelamento homologado' })
  @ApiResponse({
    status: 400,
    description:
      'Documento não autorizado, já cancelado ou recusado pela SEFAZ',
  })
  cancelDocument(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: CancelFiscalDocumentDto,
  ) {
    return this.operationsService.cancel(
      companyId,
      id,
      dto.justificativa,
      user.id,
    );
  }

  @Post('documents/:id/consulta')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({
    summary:
      'Consultar a situação do documento na SEFAZ e reconciliar o status',
  })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 201, description: 'Situação consultada' })
  consultarDocument(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.operationsService.consultar(companyId, id, user.id);
  }

  @Post('documents/:id/retry')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.emit')
  @ApiOperation({
    summary: 'Reprocessar a emissão mantendo série e número do documento',
  })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({ status: 201, description: 'Emissão reenfileirada' })
  @ApiResponse({
    status: 400,
    description: 'Documento não está em estado reprocessável',
  })
  retryDocument(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.operationsService.retry(companyId, id, user.id);
  }

  @Get('engine/health')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({
    summary: 'Verificar se o motor fiscal (.NET) está no ar',
    description:
      'Sonda o `/health` do microserviço. Não consulta a SEFAZ e não usa certificado.',
  })
  @ApiResponse({ status: 200, description: 'Disponibilidade do motor fiscal' })
  engineHealth() {
    return this.operationsService.engineHealth();
  }

  @Post('settings/:establishmentId/sefaz-status')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.settings.read')
  @ApiOperation({ summary: 'Testar a comunicação com a SEFAZ' })
  @ApiParam({ name: 'establishmentId', description: 'ID do estabelecimento' })
  @ApiResponse({ status: 201, description: 'Disponibilidade do serviço' })
  testarSefaz(
    @CurrentCompany() companyId: string,
    @Param('establishmentId') establishmentId: string,
  ) {
    return this.operationsService.statusServico(companyId, establishmentId);
  }

  @Get('documents/:id/danfe')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({
    summary: 'Download do DANFE de um documento fiscal',
    description:
      'O formato varia por modelo: NFC-e devolve PDF, NF-e devolve HTML. ' +
      'Use o Content-Type da resposta em vez de assumir PDF.',
  })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiResponse({
    status: 200,
    description: 'DANFE em PDF (NFC-e) ou HTML (NF-e)',
  })
  @ApiResponse({ status: 404, description: 'DANFE não disponível' })
  async getDanfe(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const danfe = await this.fiscalService.getDanfe(id, companyId);

    response.setHeader('Content-Type', danfe.contentType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="danfe-${id}.${danfe.extensao}"`,
    );

    return new StreamableFile(danfe.conteudo);
  }

  @Get('documents/:id/xml/:tipo')
  @UseGuards(RequirePermissionGuard)
  @RequirePermission('fiscal.read')
  @ApiOperation({ summary: 'Download do XML de um documento fiscal' })
  @ApiParam({ name: 'id', description: 'ID do documento fiscal' })
  @ApiParam({
    name: 'tipo',
    description: 'Tipo do XML',
    enum: ['enviado', 'autorizado', 'cancelamento'],
  })
  @ApiResponse({ status: 200, description: 'Conteúdo do XML' })
  @ApiResponse({ status: 404, description: 'XML não disponível' })
  getXml(
    @Param('id') id: string,
    @Param('tipo') tipo: 'enviado' | 'autorizado' | 'cancelamento',
    @CurrentCompany() companyId: string,
  ) {
    return this.fiscalService.getXml(id, companyId, tipo);
  }
}
