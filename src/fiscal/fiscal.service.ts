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
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
// archiver preso na linha 7.x de propósito: a 8.x é ESM-only e, num app
// CommonJS, só carrega pelo `require(esm)` experimental do Node.
import archiver, { Archiver } from 'archiver';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFiscalSettingsDto } from './dto/create-fiscal-settings.dto';
import { UpdateFiscalSettingsDto } from './dto/update-fiscal-settings.dto';
import { QueryFiscalDocumentsDto } from './dto/query-fiscal-documents.dto';
import { EmitNfceDto } from './dto/emit-nfce.dto';
import { EmitNfeDto } from './dto/emit-nfe.dto';
import { ExportXmlsDto } from './dto/export-xmls.dto';
import {
  DocumentoExportavel,
  LIMITE_DOCUMENTOS,
  mensagemLimiteDocumentos,
  montarLoteDeExportacao,
  montarManifesto,
  NOME_MANIFESTO,
  nomeArquivoZip,
  resolverPeriodo,
} from './export/fiscal-export';
import {
  buildFiscalSnapshot,
  buildNfeSnapshot,
} from './emission/fiscal-snapshot.builder';
import { isFiscalStorageKey } from './emission/fiscal-storage';
import {
  assertEmissionSettings,
  buildProductionChecklist,
  descreverModelos,
  ProductionChecklistItem,
} from './emission/fiscal-preconditions';
import { mapAmbiente } from './emission/fiscal-rules';
import { StorageService } from '../storage/storage.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';

/** Campos que a exportação em lote lê de cada documento. */
const SELECAO_EXPORTACAO = {
  chaveAcesso: true,
  numero: true,
  serie: true,
  modelo: true,
  status: true,
  dataAutorizacao: true,
  valorTotal: true,
  xmlAutorizado: true,
  xmlCancelamento: true,
  // A correção muda o que a nota diz sem gerar nota nova: o lote precisa levá-la
  // junto, senão o contador escritura o texto que a empresa já corrigiu.
  correctionLetters: {
    select: { sequencia: true, xmlEvento: true },
    orderBy: { sequencia: 'asc' },
  },
} satisfies Prisma.FiscalDocumentSelect;

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly engine: DfeNetFiscalEngine,
    private readonly certificates: FiscalCertificateService,
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

    const ambiente =
      (dto.ambiente as FiscalEnvironment) ?? FiscalEnvironment.HOMOLOGACAO;

    // Uma configuração por ambiente: homologação e produção são independentes
    // e não compartilham série, numeração, CSC nem certificado.
    const doAmbiente = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId: dto.establishmentId,
        companyId,
        ambiente,
        deletedAt: null,
      },
    });

    if (doAmbiente) {
      throw new BadRequestException(
        `Já existe uma configuração fiscal de ${ambiente} para este estabelecimento`,
      );
    }

    // A primeira configuração do estabelecimento nasce em uso; as seguintes
    // só entram em uso pela troca explícita de ambiente.
    const jaExisteAlguma = await this.prisma.fiscalSettings.count({
      where: {
        establishmentId: dto.establishmentId,
        companyId,
        deletedAt: null,
      },
    });

    return this.prisma.fiscalSettings.create({
      data: {
        establishmentId: dto.establishmentId,
        companyId,
        ambiente,
        // Ausente vale como os dois: o estabelecimento novo ainda não sabe o
        // que vai emitir, e presumir menos travaria a liberação depois.
        modelosEmitidos: dto.modelosEmitidos ?? [
          FiscalDocumentModel.NFCE,
          FiscalDocumentModel.NFE,
        ],
        serieNfce: dto.serieNfce ?? 1,
        codigoCsc: dto.codigoCsc,
        idCsc: dto.idCsc,
        certificadoRef: dto.certificadoRef,
        certificadoSenhaRef: dto.certificadoSenhaRef,
        ativo: dto.ativo ?? jaExisteAlguma === 0,
      },
    });
  }

  /** Configuração em uso pelo estabelecimento (a marcada como ativa). */
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
      orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** As configurações do estabelecimento, uma por ambiente. */
  async findSettingsByEnvironment(
    companyId: string,
    establishmentId: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>[]> {
    return this.prisma.fiscalSettings.findMany({
      where: { establishmentId, companyId, deletedAt: null },
      orderBy: { ambiente: 'asc' },
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
    userId?: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const settings = await this.findSettings(companyId, establishmentId);

    if (!settings) {
      throw new NotFoundException(
        'Configuração fiscal não encontrada para este estabelecimento',
      );
    }

    const data: Prisma.FiscalSettingsUpdateInput = {};

    // Ambiente virou chave da configuração: trocar é escolher outra linha.
    if (dto.ambiente !== undefined && dto.ambiente !== settings.ambiente) {
      throw new BadRequestException(
        'Use POST /fiscal/settings/:establishmentId/ambientes/:ambiente/ativar para trocar de ambiente',
      );
    }
    if (dto.modelosEmitidos !== undefined)
      data.modelosEmitidos = dto.modelosEmitidos;
    if (dto.serieNfce !== undefined) data.serieNfce = dto.serieNfce;
    if (dto.proximoNumeroNfce !== undefined)
      data.proximoNumeroNfce = dto.proximoNumeroNfce;
    if (dto.codigoCsc !== undefined) data.codigoCsc = dto.codigoCsc;
    if (dto.idCsc !== undefined) data.idCsc = dto.idCsc;
    if (dto.serieNfe !== undefined) data.serieNfe = dto.serieNfe;
    if (dto.proximoNumeroNfe !== undefined)
      data.proximoNumeroNfe = dto.proximoNumeroNfe;
    if (dto.certificadoRef !== undefined)
      data.certificadoRef = dto.certificadoRef;
    if (dto.certificadoSenhaRef !== undefined)
      data.certificadoSenhaRef = dto.certificadoSenhaRef;
    if (dto.certificadoValidade !== undefined)
      data.certificadoValidade = new Date(dto.certificadoValidade);
    if (dto.certificadoSubject !== undefined)
      data.certificadoSubject = dto.certificadoSubject;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const auditoria = this.montarEventosDeAlteracao(settings, dto, userId);

    const [atualizado] = await this.prisma.$transaction([
      this.prisma.fiscalSettings.update({
        where: { id: settings.id },
        data,
      }),
      ...auditoria.map((evento) =>
        this.prisma.fiscalSettingsEvent.create({ data: evento }),
      ),
    ]);

    return atualizado;
  }

  /**
   * Série e CSC mudam a identidade fiscal do estabelecimento: cada alteração
   * fica registrada com o valor anterior, o novo e quem alterou.
   */
  private montarEventosDeAlteracao(
    settings: Prisma.FiscalSettingsGetPayload<null>,
    dto: UpdateFiscalSettingsDto,
    userId?: string,
  ): Prisma.FiscalSettingsEventUncheckedCreateInput[] {
    const eventos: Prisma.FiscalSettingsEventUncheckedCreateInput[] = [];
    const base = {
      companyId: settings.companyId,
      fiscalSettingsId: settings.id,
      usuarioId: userId,
    };

    // Trocar os modelos muda o que a liberação de produção cobra: quem tira a
    // NFC-e da lista deixa de ser barrado por CSC. Fica registrado.
    if (
      dto.modelosEmitidos !== undefined &&
      dto.modelosEmitidos.join(',') !== settings.modelosEmitidos.join(',')
    ) {
      eventos.push({
        ...base,
        tipo: 'modelos_emitidos',
        valorAnterior: settings.modelosEmitidos.join(', ') || '(nenhum)',
        valorNovo: dto.modelosEmitidos.join(', '),
      });
    }

    if (dto.serieNfce !== undefined && dto.serieNfce !== settings.serieNfce) {
      eventos.push({
        ...base,
        tipo: 'serie',
        valorAnterior: `NFC-e ${settings.serieNfce}`,
        valorNovo: `NFC-e ${dto.serieNfce}`,
      });
    }

    // Série da NF-e audita separado: são duas sequências fiscais distintas, e
    // um evento que não diga de qual modelo é não serve para reconstituir nada.
    if (dto.serieNfe !== undefined && dto.serieNfe !== settings.serieNfe) {
      eventos.push({
        ...base,
        tipo: 'serie',
        valorAnterior: `NF-e ${settings.serieNfe}`,
        valorNovo: `NF-e ${dto.serieNfe}`,
      });
    }

    // O valor do CSC é segredo: a auditoria registra a troca, não o código.
    const trocouCsc =
      (dto.codigoCsc !== undefined && dto.codigoCsc !== settings.codigoCsc) ||
      (dto.idCsc !== undefined && dto.idCsc !== settings.idCsc);

    if (trocouCsc) {
      eventos.push({
        ...base,
        tipo: 'csc',
        valorAnterior: settings.idCsc ? `idCSC ${settings.idCsc}` : null,
        valorNovo: dto.idCsc ? `idCSC ${dto.idCsc}` : null,
      });
    }

    return eventos;
  }

  /**
   * Troca o ambiente em uso pelo estabelecimento.
   *
   * A configuração do ambiente alvo precisa existir, e produção só entra em
   * uso depois de liberada pelo checklist.
   */
  async activateEnvironment(
    companyId: string,
    establishmentId: string,
    ambiente: FiscalEnvironment,
    userId?: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const atual = await this.findSettings(companyId, establishmentId);
    const alvo = await this.prisma.fiscalSettings.findFirst({
      where: { establishmentId, companyId, ambiente, deletedAt: null },
    });

    if (!alvo) {
      throw new NotFoundException(
        `Não existe configuração fiscal de ${ambiente} para este estabelecimento`,
      );
    }

    if (ambiente === FiscalEnvironment.PRODUCAO && !alvo.producaoLiberada) {
      throw new BadRequestException(
        'Conclua o checklist e libere a produção antes de ativá-la',
      );
    }

    const [ativado] = await this.prisma.$transaction([
      this.prisma.fiscalSettings.update({
        where: { id: alvo.id },
        data: { ativo: true },
      }),
      this.prisma.fiscalSettings.updateMany({
        where: {
          establishmentId,
          companyId,
          deletedAt: null,
          id: { not: alvo.id },
        },
        data: { ativo: false },
      }),
      this.prisma.fiscalSettingsEvent.create({
        data: {
          companyId,
          fiscalSettingsId: alvo.id,
          tipo: 'ambiente',
          valorAnterior: atual?.ambiente ?? null,
          valorNovo: ambiente,
          usuarioId: userId,
        },
      }),
    ]);

    this.logger.log(
      `Ambiente fiscal do estabelecimento ${establishmentId} alterado para ${ambiente}`,
    );

    return ativado;
  }

  /** Checklist de ativação da produção, com o que já está pronto e o que falta. */
  async getProductionChecklist(
    companyId: string,
    establishmentId: string,
  ): Promise<{
    liberada: boolean;
    liberadaEm: Date | null;
    itens: ProductionChecklistItem[];
  }> {
    const settings = await this.requireProductionSettings(
      companyId,
      establishmentId,
    );

    return {
      liberada: settings.producaoLiberada,
      liberadaEm: settings.producaoLiberadaEm,
      itens: buildProductionChecklist(settings, {
        produtosComPendencia: await this.contarProdutosComPendencia(companyId),
      }),
    };
  }

  /**
   * Produtos ativos que ainda não emitem.
   *
   * Entra no checklist como aviso, não como bloqueio: o CSOSN é decisão do
   * contador e o sistema não preenche por ninguém. Mas dizer quantos faltam
   * antes da liberação é melhor do que a rejeição aparecer na primeira venda.
   */
  private contarProdutosComPendencia(companyId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        fiscalComplete: false,
      },
    });
  }

  /**
   * Libera a emissão em produção do estabelecimento.
   *
   * Recusa enquanto qualquer item do checklist estiver pendente — é o que
   * impede uma nota real sair por engano com dados de homologação.
   */
  async releaseProduction(
    companyId: string,
    establishmentId: string,
    userId?: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const settings = await this.requireProductionSettings(
      companyId,
      establishmentId,
    );

    const pendentes = buildProductionChecklist(settings).filter(
      (item) => !item.ok && item.bloqueante !== false,
    );

    if (pendentes.length > 0) {
      throw new BadRequestException(
        `Não é possível liberar a produção: ${pendentes
          .map((item) => item.item.toLowerCase())
          .join('; ')}`,
      );
    }

    const [liberada] = await this.prisma.$transaction([
      this.prisma.fiscalSettings.update({
        where: { id: settings.id },
        data: {
          producaoLiberada: true,
          producaoLiberadaEm: new Date(),
          producaoLiberadaPor: userId,
        },
      }),
      this.prisma.fiscalSettingsEvent.create({
        data: {
          companyId,
          fiscalSettingsId: settings.id,
          tipo: 'producao_liberada',
          valorNovo: descreverModelos(settings),
          usuarioId: userId,
        },
      }),
    ]);

    this.logger.log(
      `Produção liberada para o estabelecimento ${establishmentId}`,
    );

    return liberada;
  }

  /** Revoga a liberação e volta o estabelecimento para homologação. */
  async revokeProduction(
    companyId: string,
    establishmentId: string,
    userId?: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const settings = await this.requireProductionSettings(
      companyId,
      establishmentId,
    );

    const [revogada] = await this.prisma.$transaction([
      this.prisma.fiscalSettings.update({
        where: { id: settings.id },
        data: {
          producaoLiberada: false,
          producaoLiberadaEm: null,
          producaoLiberadaPor: null,
          ativo: false,
        },
      }),
      this.prisma.fiscalSettings.updateMany({
        where: {
          establishmentId,
          companyId,
          ambiente: FiscalEnvironment.HOMOLOGACAO,
          deletedAt: null,
        },
        data: { ativo: true },
      }),
      this.prisma.fiscalSettingsEvent.create({
        data: {
          companyId,
          fiscalSettingsId: settings.id,
          tipo: 'producao_revogada',
          valorAnterior: descreverModelos(settings),
          valorNovo: 'revogada',
          usuarioId: userId,
        },
      }),
    ]);

    return revogada;
  }

  /**
   * Valida que a primeira nota autorizada em produção pode ser consultada
   * publicamente na SEFAZ, confirmando que todo o pipeline de produção
   * funciona end-to-end.
   */
  async validarConsultaPublica(
    companyId: string,
    establishmentId: string,
    userId?: string,
  ): Promise<{ validada: boolean; chaveAcesso: string; situacao: string }> {
    const settings = await this.requireProductionSettings(
      companyId,
      establishmentId,
    );

    if (!settings.producaoLiberada) {
      throw new BadRequestException(
        'Libere a produção antes de validar a consulta pública',
      );
    }

    const documento = await this.prisma.fiscalDocument.findFirst({
      where: {
        establishmentId,
        companyId,
        ambiente: FiscalEnvironment.PRODUCAO,
        status: FiscalDocumentStatus.AUTORIZADO,
        deletedAt: null,
      },
      orderBy: { dataAutorizacao: 'desc' },
    });

    if (!documento || !documento.chaveAcesso) {
      throw new BadRequestException(
        'Nenhuma nota autorizada em produção encontrada para validar a consulta pública',
      );
    }

    const credentials = await this.certificates.loadCredentials(
      companyId,
      establishmentId,
      FiscalEnvironment.PRODUCAO,
    );

    const result = await this.engine.consultar({
      chaveAcesso: documento.chaveAcesso,
      ambiente: mapAmbiente(FiscalEnvironment.PRODUCAO),
      ...credentials,
    });

    if (!result.sucesso) {
      throw new BadRequestException(
        `Falha ao consultar a nota na SEFAZ: ${result.mensagemErro ?? 'erro desconhecido'}`,
      );
    }

    if (!/autorizad/i.test(result.status ?? '')) {
      throw new BadRequestException(
        `A nota não está autorizada na consulta pública: ${result.status ?? 'situação desconhecida'}`,
      );
    }

    const agora = new Date();

    await this.prisma.$transaction([
      this.prisma.fiscalSettings.update({
        where: { id: settings.id },
        data: {
          consultaPublicaValidadaEm: agora,
          consultaPublicaValidadaPor: userId,
        },
      }),
      this.prisma.fiscalSettingsEvent.create({
        data: {
          companyId,
          fiscalSettingsId: settings.id,
          tipo: 'consulta_publica_validada',
          valorNovo: documento.chaveAcesso,
          usuarioId: userId,
        },
      }),
    ]);

    this.logger.log(
      `Consulta pública validada: estabelecimento=${establishmentId}, chave=${documento.chaveAcesso}`,
    );

    return {
      validada: true,
      chaveAcesso: documento.chaveAcesso,
      situacao: result.status ?? 'Autorizado',
    };
  }

  /** Histórico de alterações da configuração fiscal do estabelecimento. */
  async getSettingsHistory(
    companyId: string,
    establishmentId: string,
  ): Promise<Prisma.FiscalSettingsEventGetPayload<null>[]> {
    const settings = await this.findSettingsByEnvironment(
      companyId,
      establishmentId,
    );

    if (settings.length === 0) {
      throw new NotFoundException(
        'Configuração fiscal não encontrada para este estabelecimento',
      );
    }

    return this.prisma.fiscalSettingsEvent.findMany({
      where: {
        companyId,
        fiscalSettingsId: { in: settings.map((linha) => linha.id) },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireProductionSettings(
    companyId: string,
    establishmentId: string,
  ): Promise<Prisma.FiscalSettingsGetPayload<null>> {
    const settings = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId,
        companyId,
        ambiente: FiscalEnvironment.PRODUCAO,
        deletedAt: null,
      },
    });

    if (!settings) {
      throw new NotFoundException(
        'Crie a configuração fiscal de produção deste estabelecimento antes',
      );
    }

    return settings;
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
    const [sale, company] = await Promise.all([
      this.prisma.sale.findFirst({
        where: {
          id: dto.saleId,
          companyId,
          deletedAt: null,
          status: 'CONCLUIDA',
        },
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true,
          establishment: true,
        },
      }),
      this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
      }),
    ]);

    if (!sale || !company) {
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

    // Pré-condições e snapshot antes de reservar numeração
    assertEmissionSettings(fiscalSettings);
    const snapshot = buildFiscalSnapshot(company, sale);

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
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
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
   * Emite uma NF-e modelo 55 para uma venda concluída.
   *
   * Espelha `createManualEmission`, com três diferenças que importam: o
   * snapshot exige destinatário completo, a numeração é a série própria da
   * NF-e, e o CSC não participa.
   *
   * **Recorte vigente:** operação interna e destinatário pessoa jurídica. O
   * `buildNfeSnapshot` recusa o resto **antes** de reservar numeração — o motor
   * recusaria de novo, mas aí o número já teria sido queimado.
   */
  async createNfeEmission(
    companyId: string,
    dto: EmitNfeDto,
    userId: string,
  ): Promise<Prisma.FiscalDocumentGetPayload<null>> {
    const [sale, company] = await Promise.all([
      this.prisma.sale.findFirst({
        where: {
          id: dto.saleId,
          companyId,
          deletedAt: null,
          status: 'CONCLUIDA',
        },
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true,
          establishment: true,
        },
      }),
      this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
      }),
    ]);

    if (!sale || !company) {
      throw new NotFoundException(
        'Venda concluída não encontrada para emissão fiscal',
      );
    }

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

    const fiscalSettings = await this.prisma.fiscalSettings.findFirst({
      where: { establishmentId, companyId, ativo: true, deletedAt: null },
    });

    if (!fiscalSettings) {
      throw new BadRequestException(
        'Configuração fiscal não encontrada ou inativa para este estabelecimento',
      );
    }

    assertEmissionSettings(fiscalSettings);

    const snapshot = buildNfeSnapshot(company, sale, {
      naturezaOperacao: dto.naturezaOperacao,
      consumidorFinal: dto.consumidorFinal,
      presenca: dto.presenca,
      transporte: dto.transporte,
      cobranca: dto.cobranca,
    });

    // Numeração própria: NF-e e NFC-e são sequências fiscais distintas.
    await this.prisma.fiscalSettings.update({
      where: { id: fiscalSettings.id },
      data: { proximoNumeroNfe: { increment: 1 } },
    });

    const numero = fiscalSettings.proximoNumeroNfe;

    const fiscalDocument = await this.prisma.fiscalDocument.create({
      data: {
        companyId,
        establishmentId,
        saleId: dto.saleId,
        modelo: FiscalDocumentModel.NFE,
        serie: fiscalSettings.serieNfe,
        numero,
        ambiente: fiscalSettings.ambiente,
        status: FiscalDocumentStatus.PENDENTE,
        idempotencyKey:
          dto.idempotencyKey ?? `nfe-${dto.saleId}-${randomUUID()}`,
        engine: 'dfe-net',
        valorTotal: sale.totalAmount,
        dataEmissao: new Date(),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      include: {
        establishment: { select: { id: true, name: true } },
      },
    });

    await this.prisma.fiscalStatusHistory.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        statusFrom: FiscalDocumentStatus.NAO_EMITIDO,
        statusTo: FiscalDocumentStatus.PENDENTE,
        motivo: 'Emissão de NF-e solicitada',
        usuarioId: userId,
      },
    });

    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId: fiscalDocument.id,
        tipo: 'emissao',
        detalhes: {
          action: 'nfe_emission_created',
          saleId: dto.saleId,
          consumidorFinal: dto.consumidorFinal,
        },
        usuarioId: userId,
      },
    });

    this.logger.log(
      `NF-e criada: documento=${fiscalDocument.id}, venda=${dto.saleId}, número=${numero}`,
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

    const conteudo = await this.lerXmlArmazenado(xmlContent);

    if (conteudo === null) {
      throw new NotFoundException(
        `XML ${tipo} não pôde ser recuperado do armazenamento`,
      );
    }

    return conteudo;
  }

  /**
   * Resolve o XML gravado no documento, que pode estar em dois formatos: o
   * conteúdo direto na coluna ou uma chave do storage — `persistirArquivos`
   * grava de um jeito ou de outro conforme `storage.isConfigured()`.
   *
   * Devolve `null` em vez de lançar quando o arquivo não é recuperável: quem
   * chama decide se isso é um `404` (download individual) ou uma linha marcada
   * como ausente no manifesto (exportação em lote).
   */
  private async lerXmlArmazenado(valor: string | null): Promise<string | null> {
    if (!valor) {
      return null;
    }

    if (!isFiscalStorageKey(valor)) {
      return valor;
    }

    try {
      return await this.storageService.download(valor);
    } catch (error) {
      this.logger.error(
        `Falha ao ler o XML do storage (${valor}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Exporta, num ZIP em stream, os XMLs dos documentos fiscais de um período.
   *
   * Só entram `AUTORIZADO` e `CANCELADO`: são os documentos que existem para o
   * fisco e vão para a escrituração. Rejeitado nunca existiu; erro e pendente
   * não chegaram à SEFAZ.
   */
  async exportarXmls(
    companyId: string,
    dto: ExportXmlsDto,
  ): Promise<{ nomeArquivo: string; arquivo: Readable }> {
    const periodo = resolverPeriodo(dto.dataInicio, dto.dataFim);
    const ambiente = dto.ambiente ?? FiscalEnvironment.PRODUCAO;

    const where: Prisma.FiscalDocumentWhereInput = {
      companyId,
      deletedAt: null,
      ambiente,
      status: {
        in: [FiscalDocumentStatus.AUTORIZADO, FiscalDocumentStatus.CANCELADO],
      },
      // Pela data de emissão: é a data que consta do XML e que define em qual
      // período o contador escritura o documento.
      dataEmissao: { gte: periodo.inicio, lte: periodo.fim },
      ...(dto.establishmentId
        ? { establishmentId: dto.establishmentId }
        : undefined),
      ...(dto.modelo ? { modelo: dto.modelo } : undefined),
    };

    // Antes de montar qualquer coisa: recusar o lote grande demais é barato,
    // descobrir isso com o stream aberto não é.
    const total = await this.prisma.fiscalDocument.count({ where });

    if (total > LIMITE_DOCUMENTOS) {
      throw new BadRequestException(mensagemLimiteDocumentos(total));
    }

    const documentos = await this.prisma.fiscalDocument.findMany({
      where,
      orderBy: [{ dataEmissao: 'asc' }, { numero: 'asc' }],
      select: SELECAO_EXPORTACAO,
    });

    const empresa = await this.prisma.company.findFirst({
      where: { id: companyId },
      select: { name: true, nomeFantasia: true, razaoSocial: true },
    });

    const arquivo = archiver('zip', { zlib: { level: 9 } });

    arquivo.on('error', (error: Error) => {
      this.logger.error(
        `Falha ao montar o ZIP da exportação: ${error.message}`,
      );
    });

    void this.preencherZipDaExportacao(arquivo, documentos);

    return {
      nomeArquivo: nomeArquivoZip(
        empresa?.nomeFantasia ||
          empresa?.razaoSocial ||
          empresa?.name ||
          'empresa',
        periodo,
        ambiente,
      ),
      arquivo,
    };
  }

  /**
   * Alimenta o ZIP documento a documento e fecha com o manifesto.
   *
   * XML que não volta do storage **não** derruba a exportação: entra como
   * ausente no manifesto e o lote segue. Um arquivo perdido em agosto não pode
   * impedir o fechamento do mês inteiro, e é a mesma filosofia do
   * `persistirArquivos` — falha de storage não invalida nota autorizada.
   */
  private async preencherZipDaExportacao(
    arquivo: Archiver,
    documentos: DocumentoExportavel[],
  ): Promise<void> {
    try {
      const manifesto = await montarLoteDeExportacao(
        documentos,
        (valor) => this.lerXmlArmazenado(valor),
        {
          adicionar: (nome, conteudo) =>
            arquivo.append(conteudo, { name: nome }),
        },
      );

      arquivo.append(Buffer.from(montarManifesto(manifesto), 'utf-8'), {
        name: NOME_MANIFESTO,
      });

      await arquivo.finalize();
    } catch (error) {
      // Aborta o stream em vez de finalizar: melhor o download falhar do que o
      // contador receber um ZIP incompleto que parece completo.
      this.logger.error(
        `Exportação de XMLs interrompida: ${error instanceof Error ? error.message : String(error)}`,
      );
      arquivo.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Retorna o PDF do DANFE de um documento fiscal autorizado.
   */
  /**
   * DANFE do documento, junto do formato em que ele foi gravado.
   *
   * O formato **não** é constante: o da NFC-e é PDF e o da NF-e é HTML. Servir
   * HTML com `Content-Type: application/pdf` entrega ao lojista um arquivo que
   * nenhum leitor abre — e o navegador nem tenta, porque acredita no cabeçalho.
   * A extensão gravada na chave do storage é a fonte da verdade.
   */
  async getDanfe(
    fiscalDocumentId: string,
    companyId: string,
  ): Promise<{ conteudo: Buffer; contentType: string; extensao: string }> {
    const { conteudo, chave } = await this.lerDanfe(
      fiscalDocumentId,
      companyId,
    );
    const html = chave?.toLowerCase().endsWith('.html') ?? false;

    return {
      conteudo,
      contentType: html ? 'text/html; charset=utf-8' : 'application/pdf',
      extensao: html ? 'html' : 'pdf',
    };
  }

  private async lerDanfe(
    fiscalDocumentId: string,
    companyId: string,
  ): Promise<{ conteudo: Buffer; chave: string | null }> {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    if (!document.danfeUrl) {
      throw new NotFoundException('DANFE não disponível para este documento');
    }

    await this.prisma.fiscalDocumentEvent.create({
      data: {
        fiscalDocumentId,
        tipo: 'download_danfe',
        detalhes: { chaveAcesso: document.chaveAcesso },
      },
    });

    // Sem storage configurado o DANFE fica na própria coluna, em base64, e não
    // há chave para consultar a extensão — nesse caso ele é sempre o PDF da
    // NFC-e, porque a NF-e nasceu depois do storage.
    if (!isFiscalStorageKey(document.danfeUrl)) {
      return {
        conteudo: Buffer.from(document.danfeUrl, 'base64'),
        chave: null,
      };
    }

    try {
      return {
        conteudo: await this.storageService.downloadBuffer(document.danfeUrl),
        chave: document.danfeUrl,
      };
    } catch (error) {
      this.logger.error(
        `Falha ao ler o DANFE do storage (${document.danfeUrl}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new NotFoundException(
        'DANFE não pôde ser recuperado do armazenamento',
      );
    }
  }
}
