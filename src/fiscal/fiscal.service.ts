import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FiscalDocumentStatus,
  FiscalDocumentModel,
  FiscalEnvironment,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFiscalSettingsDto } from './dto/create-fiscal-settings.dto';
import { UpdateFiscalSettingsDto } from './dto/update-fiscal-settings.dto';
import { QueryFiscalDocumentsDto } from './dto/query-fiscal-documents.dto';
import { EmitNfceDto } from './dto/emit-nfce.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ──────────────────────────────────────────────
  // Fiscal Settings
  // ──────────────────────────────────────────────

  async createSettings(
    companyId: string,
    dto: CreateFiscalSettingsDto,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    // Valida que o estabelecimento existe e pertence à empresa
    if (!dto.establishmentId) {
      throw new BadRequestException(
        'Estabelecimento é obrigatório para criar configuração fiscal',
      );
    }

    const establishment = await this.prisma.establishment.findFirst({
      where: {
        id: dto.establishmentId,
        companyId,
        deletedAt: null,
      },
    });

    if (!establishment) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    // Verifica se já existe configuração para este estabelecimento
    const existing = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId: dto.establishmentId,
        companyId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Já existe uma configuração fiscal para este estabelecimento',
      );
    }

    return this.prisma.fiscalSettings.create({
      data: {
        establishmentId: dto.establishmentId,
        companyId,
        ambiente:
          (dto.ambiente as FiscalEnvironment) ?? FiscalEnvironment.HOMOLOGACAO,
        serieNfce: dto.serieNfce ?? 1,
        codigoCsc: dto.codigoCsc,
        idCsc: dto.idCsc,
        certificadoRef: dto.certificadoRef,
        certificadoSenhaRef: dto.certificadoSenhaRef,
        ativo: dto.ativo ?? true,
      },
    });
  }

  async findSettings(
    companyId: string,
    establishmentId: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null> | null> {
    return this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId,
        companyId,
        deletedAt: null,
      },
    });
  }

  async findAllSettings(
    companyId: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>[]> {
    return this.prisma.fiscalSettings.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      include: {
        establishment: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateSettings(
    companyId: string,
    establishmentId: string,
    dto: UpdateFiscalSettingsDto,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const settings = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId,
        companyId,
        deletedAt: null,
      },
    });

    if (!settings) {
      throw new NotFoundException(
        'Configuração fiscal não encontrada para este estabelecimento',
      );
    }

    const data: Prisma.FiscalSettingsUpdateInput = {};

    if (dto.ambiente !== undefined) {
      data.ambiente = dto.ambiente as FiscalEnvironment;
    }
    if (dto.serieNfce !== undefined) data.serieNfce = dto.serieNfce;
    if (dto.proximoNumeroNfce !== undefined)
      data.proximoNumeroNfce = dto.proximoNumeroNfce;
    if (dto.codigoCsc !== undefined) data.codigoCsc = dto.codigoCsc;
    if (dto.idCsc !== undefined) data.idCsc = dto.idCsc;
    if (dto.certificadoRef !== undefined)
      data.certificadoRef = dto.certificadoRef;
    if (dto.certificadoSenhaRef !== undefined)
      data.certificadoSenhaRef = dto.certificadoSenhaRef;
    if (dto.certificadoValidade !== undefined)
      data.certificadoValidade = new Date(dto.certificadoValidade);
    if (dto.certificadoSubject !== undefined)
      data.certificadoSubject = dto.certificadoSubject;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    return this.prisma.fiscalSettings.update({
      where: { id: settings.id },
      data,
    });
  }

  // ──────────────────────────────────────────────
  // Fiscal Documents
  // ──────────────────────────────────────────────

  async findAllDocuments(
    companyId: string,
    query: QueryFiscalDocumentsDto,
  ): Promise<{
    data: Prisma.FiscalDocumentGetPayload<null>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FiscalDocumentWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status as FiscalDocumentStatus;
    }
    if (query.modelo) {
      where.modelo = query.modelo as FiscalDocumentModel;
    }
    if (query.saleId) {
      where.saleId = query.saleId;
    }
    if (query.establishmentId) {
      where.establishmentId = query.establishmentId;
    }
    if (query.startDate || query.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) createdAt.lte = new Date(query.endDate);
      where.createdAt = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.fiscalDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          establishment: { select: { id: true, name: true } },
          sale: { select: { id: true, saleNumber: true } },
        },
      }),
      this.prisma.fiscalDocument.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findDocumentById(
    id: string,
    companyId: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null>> {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        establishment: { select: { id: true, name: true } },
        sale: { select: { id: true, saleNumber: true, totalAmount: true } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    return document;
  }

  async findDocumentBySale(
    saleId: string,
    companyId: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null> | null> {
    return this.prisma.fiscalDocument.findFirst({
      where: {
        saleId,
        companyId,
        deletedAt: null,
      },
    });
  }

  /**
   * Emite manualmente uma NFC-e para uma venda existente.
   *
   * Usado quando a emissão automática falhou ou quando o operador decide
   * emitir após a finalização. Cria o FiscalDocument e enfileira a emissão.
   * (A lógica de enfileiramento fica no controller para manter o service puro.)
   */
  async createManualEmission(
    companyId: string,
    dto: EmitNfceDto,
    userId: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null>> {
    // Valida a venda
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: dto.saleId,
        companyId,
        deletedAt: null,
        status: 'CONCLUIDA',
      },
      include: {
        items: { include: { product: true } },
        payments: true,
        establishment: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(
        'Venda concluída não encontrada para emissão fiscal',
      );
    }

    // Verifica se já existe documento para esta venda
    const existing = await this.prisma.fiscalDocument.findFirst({
      where: {
        saleId: dto.saleId,
        companyId,
        deletedAt: null,
        status: {
          notIn: [
            FiscalDocumentStatus.REJEITADO,
            FiscalDocumentStatus.ERRO,
            FiscalDocumentStatus.CANCELADO,
          ],
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Já existe um documento fiscal ativo para esta venda',
      );
    }

    const establishmentId = dto.establishmentId ?? sale.establishmentId;

    // Busca configuração fiscal
    const fiscalSettings = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId,
        companyId,
        ativo: true,
        deletedAt: null,
      },
    });

    if (!fiscalSettings) {
      throw new BadRequestException(
        'Configuração fiscal não encontrada ou inativa para este estabelecimento',
      );
    }

    // Reserva o próximo número atomicamente
    await this.prisma.fiscalSettings.update({
      where: { id: fiscalSettings.id },
      data: { proximoNumeroNfce: { increment: 1 } },
    });

    const numero = fiscalSettings.proximoNumeroNfce;

    // Cria o documento fiscal
    const fiscalDocument = await this.prisma.fiscalDocument.create({
      data: {
        companyId,
        establishmentId,
        saleId: dto.saleId,
        modelo: FiscalDocumentModel.NFCE,
        serie: fiscalSettings.serieNfce,
        numero,
        ambiente: fiscalSettings.ambiente,
        status: FiscalDocumentStatus.PENDENTE,
        idempotencyKey:
          dto.idempotencyKey ?? `manual-${dto.saleId}-${Date.now()}`,
        engine: 'dfe-net',
        valorTotal: sale.totalAmount,
        dataEmissao: new Date(),
        snapshot: {
          sale: {
            id: sale.id,
            saleNumber: sale.saleNumber,
            totalAmount: Number(sale.totalAmount),
          },
          items: sale.items.map((item) => ({
            productId: item.productId,
            name: item.product.name,
            ncm: item.product.ncm,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          })),
        },
      },
      include: {
        establishment: { select: { id: true, name: true } },
      },
    });

    // Adiciona histórico
    await this.prisma.fiscalStatusHistory.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        statusFrom: FiscalDocumentStatus.NAO_EMITIDO,
        statusTo: FiscalDocumentStatus.PENDENTE,
        motivo: 'Emissão manual solicitada',
        usuarioId: userId,
      },
    });

    // Registra evento
    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        tipo: 'emissao',
        detalhes: { action: 'manual_emission_created', saleId: dto.saleId },
        usuarioId: userId,
      },
    });

    this.logger.log(
      `Emissão manual criada: documento=${fiscalDocument.id}, venda=${dto.saleId}, número=${numero}`,
    );

    return fiscalDocument;
  }

  /**
   * Retorna o histórico de status de um documento fiscal.
   */
  async getStatusHistory(
    fiscalDocumentId: string,
    companyId: string,
  ): Promise<Prisma.FiscalStatusHistoryGetPayload<null>[]> {
    // Valida que o documento existe e pertence à empresa
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    return this.prisma.fiscalStatusHistory.findMany({
      where: { fiscalDocumentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retorna os eventos de um documento fiscal.
   */
  async getEvents(
    fiscalDocumentId: string,
    companyId: string,
  ): Promise<Prisma.FiscalDocumentEventGetPayload<null>[]> {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    return this.prisma.fiscalDocumentEvent.findMany({
      where: { fiscalDocumentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retorna o XML autorizado de um documento fiscal.
   */
  async getXml(
    fiscalDocumentId: string,
    companyId: string,
    tipo: 'enviado' | 'autorizado' | 'cancelamento',
  ): Promise<string> {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    let xmlContent: string | null = null;

    switch (tipo) {
      case 'enviado':
        xmlContent = document.xmlEnviado;
        break;
      case 'autorizado':
        xmlContent = document.xmlAutorizado;
        break;
      case 'cancelamento':
        xmlContent = document.xmlCancelamento;
        break;
    }

    if (!xmlContent) {
      throw new NotFoundException(
        `XML ${tipo} não disponível para este documento`,
      );
    }

    // Registra evento de download
    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId,
        tipo: 'download_xml',
        detalhes: { tipo },
      },
    });

    return xmlContent;
  }
}
