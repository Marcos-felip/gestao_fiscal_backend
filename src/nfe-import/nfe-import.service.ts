import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NfeImportMatch,
  NfeImportStatus,
  PartnerType,
  PersonType,
  Prisma,
  PurchaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { IncomingNfe, parseIncomingNfe, totalMismatch } from './nfe-xml.parser';
import { matchItem, unmatchedCount } from './nfe-import.matching';
import {
  hasIrregularDueDates,
  paymentTermsFromDuplicatas,
} from './nfe-import.payment-terms';

/**
 * Importação da NF-e de entrada.
 *
 * O caminho é `XML → NfeImport → compra em RASCUNHO`. **A importação nunca
 * movimenta estoque**: quem movimenta é a confirmação da compra, por uma pessoa
 * que olhou. Um XML com item duplicado, unidade diferente da nossa ou devolução
 * embutida corromperia o saldo sem ninguém ver.
 */
@Injectable()
export class NfeImportService {
  private readonly logger = new Logger(NfeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private readonly include = {
    items: { orderBy: { itemNumber: 'asc' } },
    supplier: { select: { id: true, name: true, cpfCnpj: true } },
    establishment: { select: { id: true, name: true } },
    purchase: { select: { id: true, purchaseNumber: true, status: true } },
  } satisfies Prisma.NfeImportInclude;

  /**
   * Lê o XML e registra a importação com o casamento de cada item já tentado.
   */
  async importXml(companyId: string, xml: string, userId?: string) {
    const nfe = parseIncomingNfe(xml);

    await this.assertNotImported(companyId, nfe.chaveAcesso);

    const establishment = await this.resolveEstablishment(companyId, nfe);
    const supplier = await this.resolveSupplier(companyId, nfe);
    const items = await this.matchItems(companyId, supplier.id, nfe);

    const pending = unmatchedCount(items);
    const xmlKey = await this.storeXml(companyId, nfe.chaveAcesso, xml);

    const created = await this.prisma.nfeImport.create({
      data: {
        companyId,
        establishmentId: establishment.id,
        supplierId: supplier.id,
        status: pending === 0 ? NfeImportStatus.READY : NfeImportStatus.PENDING,
        chaveAcesso: nfe.chaveAcesso,
        number: nfe.number,
        series: nfe.series,
        issuedAt: nfe.issuedAt,
        issuerCnpj: nfe.issuer.cnpj,
        issuerName: nfe.issuer.legalName,
        totalAmount: nfe.totalAmount,
        xmlKey,
        duplicatas: nfe.duplicatas.map((duplicata) => ({
          numero: duplicata.number,
          vencimento: duplicata.dueDate?.toISOString() ?? null,
          valor: duplicata.amount,
        })),
        userId,
        items: { create: items },
      },
      include: this.include,
    });

    this.logger.log(
      `NF-e ${nfe.chaveAcesso} importada com ${items.length} itens (${pending} pendentes)`,
    );

    return created;
  }

  async findAll(companyId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;

    const where: Prisma.NfeImportWhereInput = { companyId, deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.nfeImport.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.nfeImport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(companyId: string, id: string) {
    const found = await this.prisma.nfeImport.findFirst({
      where: { id, companyId, deletedAt: null },
      include: this.include,
    });

    if (!found) throw new NotFoundException('Importação não encontrada');

    return found;
  }

  /**
   * Aponta o produto de um item e **memoriza a escolha** para as próximas notas
   * daquele fornecedor.
   *
   * Memorizar é o que faz a segunda nota do mesmo fornecedor não perguntar nada.
   */
  async setItemProduct(
    companyId: string,
    importId: string,
    itemId: string,
    productId: string,
  ) {
    const nfeImport = await this.findOne(companyId, importId);

    if (nfeImport.status === NfeImportStatus.IMPORTED) {
      throw new BadRequestException(
        'Esta importação já virou compra; ajuste os itens na própria compra',
      );
    }

    const item = nfeImport.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Item não encontrado na importação');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    await this.prisma.$transaction(async (tx) => {
      await tx.nfeImportItem.update({
        where: { id: itemId },
        data: { productId, match: NfeImportMatch.MANUAL },
      });

      if (nfeImport.supplierId) {
        await tx.partnerProductCode.upsert({
          where: {
            partnerId_code: {
              partnerId: nfeImport.supplierId,
              code: item.supplierCode,
            },
          },
          create: {
            companyId,
            partnerId: nfeImport.supplierId,
            code: item.supplierCode,
            productId,
          },
          update: { productId },
        });
      }

      const stillPending = nfeImport.items.filter(
        (candidate) => candidate.id !== itemId && candidate.productId === null,
      ).length;

      await tx.nfeImport.update({
        where: { id: importId },
        data: {
          status:
            stillPending === 0
              ? NfeImportStatus.READY
              : NfeImportStatus.PENDING,
        },
      });
    });

    return this.findOne(companyId, importId);
  }

  /**
   * Gera a **compra em RASCUNHO**.
   *
   * Não movimenta estoque nem cria títulos: isso continua sendo efeito da
   * confirmação da compra, que é um ato de quem conferiu.
   */
  async confirm(companyId: string, importId: string) {
    const nfeImport = await this.findOne(companyId, importId);

    if (nfeImport.status === NfeImportStatus.IMPORTED) {
      throw new ConflictException(
        `Esta importação já gerou a compra #${nfeImport.purchase?.purchaseNumber ?? ''}`.trim(),
      );
    }

    const pending = nfeImport.items.filter((item) => item.productId === null);
    if (pending.length > 0) {
      const nomes = pending
        .map((item) => `${item.itemNumber} (${item.description})`)
        .join('; ');
      throw new BadRequestException(
        pending.length === 1
          ? `Falta apontar o produto do item ${nomes}`
          : `Faltam apontar os produtos dos itens ${nomes}`,
      );
    }

    const terms = paymentTermsFromDuplicatas(
      this.readDuplicatas(nfeImport.duplicatas),
    );

    const purchase = await this.prisma.$transaction(async (tx) => {
      // Sem filtrar deletedAt: o índice único (company_id, purchase_number)
      // também cobre as compras excluídas — mesma nota de PurchasesService.
      const aggregate = await tx.purchase.aggregate({
        where: { companyId },
        _max: { purchaseNumber: true },
      });

      const created = await tx.purchase.create({
        data: {
          companyId,
          establishmentId: nfeImport.establishmentId,
          supplierId: nfeImport.supplierId,
          status: PurchaseStatus.DRAFT,
          purchaseNumber: (aggregate._max.purchaseNumber ?? 0) + 1,
          totalAmount: nfeImport.totalAmount,
          paymentCondition: terms.paymentCondition,
          installments: terms.installments,
          firstDueDate: terms.firstDueDate,
          intervalDays: terms.intervalDays,
          purchaseDate: nfeImport.issuedAt,
          notes: `Importada da NF-e ${nfeImport.number}/${nfeImport.series} — chave ${nfeImport.chaveAcesso}`,
          items: {
            create: nfeImport.items.map((item) => ({
              productId: item.productId as string,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.totalAmount,
            })),
          },
        },
      });

      await tx.nfeImport.update({
        where: { id: importId },
        data: { status: NfeImportStatus.IMPORTED, purchaseId: created.id },
      });

      return created;
    });

    this.logger.log(
      `NF-e ${nfeImport.chaveAcesso} virou a compra #${purchase.purchaseNumber} em rascunho`,
    );

    return this.findOne(companyId, importId);
  }

  // ──────────────────────────────────────────────
  // Internos
  // ──────────────────────────────────────────────

  private async assertNotImported(companyId: string, chaveAcesso: string) {
    const existing = await this.prisma.nfeImport.findFirst({
      where: { companyId, chaveAcesso, deletedAt: null },
      include: { purchase: { select: { purchaseNumber: true } } },
    });

    if (!existing) return;

    // Importar duas vezes dobraria estoque e contas a pagar da mesma
    // mercadoria, e o erro só apareceria no inventário, meses depois.
    throw new ConflictException(
      existing.purchase
        ? `Esta nota já foi importada e gerou a compra #${existing.purchase.purchaseNumber}`
        : 'Esta nota já foi importada e está aguardando conferência',
    );
  }

  private async resolveEstablishment(companyId: string, nfe: IncomingNfe) {
    const establishments = await this.prisma.establishment.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, cnpj: true },
    });

    const found = establishments.find(
      (establishment) =>
        (establishment.cnpj ?? '').replace(/\D/g, '') === nfe.recipientDocument,
    );

    if (!found) {
      // Jogar na matriz faria a mercadoria aparecer no estabelecimento errado,
      // e ninguém procuraria o motivo ali.
      throw new BadRequestException(
        `A nota foi emitida para o CNPJ ${nfe.recipientDocument}, que não é de nenhum estabelecimento desta empresa`,
      );
    }

    return found;
  }

  private async resolveSupplier(companyId: string, nfe: IncomingNfe) {
    const partners = await this.prisma.partner.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, cpfCnpj: true },
    });

    const found = partners.find(
      (partner) =>
        (partner.cpfCnpj ?? '').replace(/\D/g, '') === nfe.issuer.cnpj,
    );

    if (found) return found;

    const created = await this.prisma.partner.create({
      data: {
        companyId,
        type: PartnerType.SUPPLIER,
        personType: PersonType.PJ,
        name: nfe.issuer.legalName,
        tradeName: nfe.issuer.tradeName,
        cpfCnpj: nfe.issuer.cnpj,
        rgIe: nfe.issuer.inscricaoEstadual,
        cep: nfe.issuer.zipCode,
        street: nfe.issuer.street,
        number: nfe.issuer.number,
        neighborhood: nfe.issuer.district,
        city: nfe.issuer.city,
        state: nfe.issuer.state,
        ibgeCode: nfe.issuer.cityCode,
      },
      select: { id: true, cpfCnpj: true },
    });

    this.logger.log(
      `Fornecedor ${nfe.issuer.legalName} criado a partir da NF-e ${nfe.chaveAcesso}`,
    );

    return created;
  }

  private async matchItems(
    companyId: string,
    supplierId: string,
    nfe: IncomingNfe,
  ) {
    const gtins = nfe.items
      .map((item) => item.gtin)
      .filter((gtin): gtin is string => !!gtin);

    const noProducts: { id: string; barcode: string | null }[] = [];

    const [products, codes] = await Promise.all([
      gtins.length > 0
        ? this.prisma.product.findMany({
            where: { companyId, deletedAt: null, barcode: { in: gtins } },
            select: { id: true, barcode: true },
          })
        : Promise.resolve(noProducts),
      this.prisma.partnerProductCode.findMany({
        where: {
          companyId,
          partnerId: supplierId,
          code: { in: nfe.items.map((item) => item.supplierCode) },
        },
        select: { code: true, productId: true },
      }),
    ]);

    const productsByGtin = new Map(
      products
        .filter((product) => !!product.barcode)
        .map((product) => [product.barcode as string, product]),
    );
    const supplierCodes = new Map(
      codes.map((code) => [code.code, code.productId]),
    );

    return nfe.items.map((item) => {
      const result = matchItem(item, productsByGtin, supplierCodes);

      return {
        itemNumber: item.itemNumber,
        supplierCode: item.supplierCode,
        gtin: item.gtin,
        description: item.description,
        ncm: item.ncm,
        cest: item.cest,
        cfop: item.cfop,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
        // O que o fornecedor declarou. Vai para a tela preencher o cadastro do
        // produto, sempre marcado como sugestão.
        origem: item.tax.origem,
        situacaoIcms: item.tax.situacaoIcms,
        cstPis: item.tax.cstPis,
        cstCofins: item.tax.cstCofins,
        productId: result.productId,
        match: result.match,
      };
    });
  }

  /**
   * Guarda o XML. Storage indisponível **não** derruba a importação: a nota já
   * foi lida, e recusar aqui perderia o trabalho de conferência por um problema
   * de infraestrutura.
   */
  private async storeXml(
    companyId: string,
    chaveAcesso: string,
    xml: string,
  ): Promise<string | null> {
    if (!this.storage.isConfigured()) return null;

    const key = `nfe-import/${companyId}/${chaveAcesso}.xml`;

    try {
      await this.storage.upload(key, xml, 'application/xml');
      return key;
    } catch (error) {
      this.logger.error(
        `Falha ao guardar o XML da nota ${chaveAcesso}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private readDuplicatas(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value)) return [];

    return value.map((raw) => {
      const duplicata = raw as {
        numero?: string | null;
        vencimento?: string | null;
        valor?: number;
      };

      return {
        number: duplicata.numero ?? null,
        dueDate: duplicata.vencimento ? new Date(duplicata.vencimento) : null,
        amount: Number(duplicata.valor ?? 0),
      };
    });
  }
}

/** Reexportado para a camada de apresentação montar os avisos da conferência. */
export { hasIrregularDueDates, totalMismatch };
